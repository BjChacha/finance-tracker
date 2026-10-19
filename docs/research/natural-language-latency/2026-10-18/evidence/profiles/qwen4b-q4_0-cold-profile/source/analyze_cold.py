"""Summarize measured CPU scheduling during model initialization and inference."""

import argparse
import json
from pathlib import Path

from perfetto.trace_processor import TraceProcessor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.folder / "manifest.json").read_text(encoding="utf-8"))
    pid = int(manifest["pid"])
    with TraceProcessor(trace=str(args.folder / "trace.pb")) as tp:
        processes = list(
            tp.query(
                f"SELECT upid,pid,start_ts,end_ts,name FROM process WHERE pid={pid}"
            )
        )
        starts = [row.start_ts for row in processes if row.start_ts is not None]
        if len(starts) != 1:
            raise ValueError("Expected one process creation event for this owned PID")
        start_ts = starts[0]
        upids = ",".join(str(row.upid) for row in processes)
        end_ts = next(
            iter(
                tp.query(
                    f"SELECT MAX(s.ts+s.dur) AS ts FROM sched s JOIN thread t USING(utid) WHERE t.upid IN ({upids}) AND s.dur>0"
                )
            )
        ).ts
        load_end = start_ts + round(manifest["load_ms"] * 1e6)
        first_end = start_ts + round(manifest["first_result_ms"] * 1e6)
        phases = {
            "initialization_approx": (start_ts, load_end),
            "first_request_approx": (load_end, first_end),
            "subsequent_requests_approx": (first_end, end_ts),
        }
        report = {
            "process_identities": [vars(row) for row in processes],
            "note": "Trace has split process identities for one PID; aggregate their non-overlapping scheduling slices. Phase boundaries approximate host-observed times plus device process creation; not native instrumentation.",
            "phases": {},
        }
        for phase, (start, end) in phases.items():
            if end is None or end <= start:
                raise ValueError("Invalid traced process interval")
            query = f"""
                SELECT t.tid, t.name, SUM(MIN(s.ts+s.dur,{end})-MAX(s.ts,{start}))/1e6 AS cpu_ms
                FROM sched s JOIN thread t USING(utid)
                WHERE t.upid IN ({upids}) AND s.dur>0 AND s.ts<{end} AND s.ts+s.dur>{start}
                GROUP BY t.tid,t.name ORDER BY cpu_ms DESC
            """
            threads = [vars(row) for row in tp.query(query)]
            report["phases"][phase] = {
                "wall_ms": (end - start) / 1e6,
                "cpu_ms": sum(row["cpu_ms"] for row in threads),
                "threads": threads,
            }
        report["errors"] = [
            vars(row)
            for row in tp.query(
                "SELECT name,value FROM stats WHERE severity='error' AND value>0"
            )
        ]
    (args.folder / "cold-breakdown.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                name: {key: value for key, value in data.items() if key != "threads"}
                for name, data in report["phases"].items()
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
