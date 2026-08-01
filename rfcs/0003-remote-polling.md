# RFC-0003: Remote polling as a lifecycle product

- Status: Draft — hold for external consumer evidence
- Owner: `POST-004`
- Stable API impact: none

## User evidence and hypothesis

The watch companion confirms a use case for application-controlled reloads, but
no alpha/beta report requests polling. POST-004 asks whether remote polling
belongs beside that lifecycle rather than in core.

Hypothesis: a remote provider companion may need a reusable trigger adapter with
cancellation and single-flight guarantees. Promotion requires two provider use
cases documenting rate limits, change tokens, retry semantics, credential
ownership, and acceptable staleness.

## Prototype contract

`pollRemote()` is a value-free `WatchAdapter`. A provider-owned `probe(signal)`
returns only whether a reload should be attempted. The watch lifecycle performs
the actual fresh Kasane load, diff, validation, and explicit acceptance.

The prototype enforces:

- interval from 10 ms through 300,000 ms;
- one in-flight probe and one iterator consumer;
- bounded adapter identity (128 characters);
- optional finite `maxPolls` from 1 through 1,000,000;
- immediate abort propagation and cleanup;
- no retries, backoff, jitter, cache, remote execution, SDK, credentials, or
  automatic candidate acceptance.

## Runtime and security budgets

- cancellation during the interval MUST settle `iterator.next()` within 100 ms
  in tests;
- cancellation is checked before and after every probe;
- probe failures flow through the existing watch adapter error boundary and
  never expose raw provider errors through this prototype;
- retained state is constant aside from the provider's own in-flight work;
- production retry/rate-limit budgets require provider-specific RFC evidence.

## Review decision

The lifecycle shape is viable, but generic polling policy is not justified. Keep
only the removable cancellation prototype.
