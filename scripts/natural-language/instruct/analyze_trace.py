"""Inspect captured inference scheduling without guessing from wall time."""

import argparse
import json
from pathlib import Path

from perfetto.trace_processor import TraceProcessor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", type=Path)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    queries = {
        "bounds": "select * from trace_bounds",
        "processes": f"select p.pid,p.name,sum(s.dur)/1e6 as cpu_ms,count(*) as switches from sched s join thread t using(utid) join process p using(upid) where p.pid={args.pid} group by 1,2",
        "cpu_distribution": f"select s.cpu,sum(s.dur)/1e6 as cpu_ms from sched s join thread t using(utid) join process p using(upid) where p.pid={args.pid} group by 1 order by 1",
        "thread_states": f"select s.state,sum(s.dur)/1e6 as duration_ms from thread_state s join thread t using(utid) join process p using(upid) where p.pid={args.pid} group by 1 order by 2 desc",
        "errors": "select name,value from stats where severity='error' and value>0",
    }
    with TraceProcessor(trace=str(args.trace)) as processor:
        result = {
            name: [vars(row) for row in processor.query(query)]
            for name, query in queries.items()
        }
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
