"""Report private model service spans and UI scheduling without application inputs."""

import argparse
import json
from pathlib import Path

from perfetto.trace_processor import TraceProcessor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with TraceProcessor(trace=str(args.trace)) as tp:
        report = {
            "trace": args.trace.name,
            "model_spans": [
                vars(row)
                for row in tp.query("""
                SELECT s.name, s.ts, s.dur / 1e6 AS duration_ms, t.name AS thread,
                       t.tid, p.pid, p.name AS process
                FROM slice s JOIN thread_track tt ON tt.id=s.track_id
                JOIN thread t USING(utid) LEFT JOIN process p USING(upid)
                WHERE s.name GLOB 'LocalModel/*' ORDER BY s.ts
            """)
            ],
            "app_threads": [
                vars(row)
                for row in tp.query("""
                SELECT p.pid, t.tid, t.name, sum(s.dur)/1e6 AS cpu_ms
                FROM sched s JOIN thread t USING(utid) JOIN process p USING(upid)
                WHERE p.name GLOB 'com.anonymous.financetracker*' AND s.dur>0
                GROUP BY p.pid, t.tid, t.name ORDER BY cpu_ms DESC LIMIT 25
            """)
            ],
            "errors": [
                vars(row)
                for row in tp.query("""
                SELECT name, value FROM stats WHERE severity='error' AND value>0
            """)
            ],
        }
        spans = report["model_spans"]
        if spans:
            last = spans[-1]
            completed = last["ts"] + round(last["duration_ms"] * 1e6)
            report["ui_after_model"] = [
                vars(row)
                for row in tp.query(f"""
                SELECT s.name, (s.ts-{completed})/1e6 AS offset_ms,
                       s.dur/1e6 AS duration_ms, t.name AS thread
                FROM slice s JOIN thread_track tt ON tt.id=s.track_id
                JOIN thread t USING(utid) JOIN process p USING(upid)
                WHERE p.name='com.anonymous.financetracker'
                  AND s.ts>={completed} AND s.ts<{completed}+600000000
                  AND s.dur>1000000
                ORDER BY s.dur DESC LIMIT 30
            """)
            ]
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
