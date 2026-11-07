---
name: careless app
workload:
  concurrent_users: 10
slo:
  response_time_ms: { mean: 150, p95: 400 }
  load_model: closed
model:
  primary: nosql
  store: mongodb@7
integrity:
  isolation: whatever
evolution:
  migrations: none
  compatibility: none
durability:
  replication: single-leader-async
derived:
  search:
    source: products
    mechanism: dual-write
retention:
  personal_data:
    email:
      purpose: "marketing"
      retention: "forever"
  deletion:
    sla_days: 90
    covers_derived: false
---

# Data notes

We use MongoDB and it is fast.
