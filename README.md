** HTTP Media Type Negotiator **

 ![NPM Downloads](https://img.shields.io/npm/dw/@apeleghq/http-media-type-negotiator?style=flat-square)


---
### 🚀 Features

- Negotiates HTTP media types (Accept header) against server-supported types
  following RFC 9110 §5.6.
- Parses and normalises media types and Accept headers with optional permissive
  mode to tolerate common real-world deviations.
- Supports q-value parsing and ranking.
- Tie-breaking by specificity, shared parameters, then server order for
  deterministic results.
- Exposes both a reusable factory for repeated negotiation and a one-shot
  convenience function.
- It also exposes convenience functions (also used internally) for:
  * Parsing media types (`parseMediaType`)
  * Normalising said media types (`normaliseMediaType`)
  * Parsing `Accept` heades (`parseAcceptHeader`)

### 💻 Installation

Install from npm or yarn:

```sh
npm install @apeleghq/http-media-type-negotiator
```

or

```sh
yarn add @apeleghq/http-media-type-negotiator
```

### 📚 Usage

#### One-shot negotiation

Use the convenience function when you just need to negotiate once:

```javascript
import negotiateMediaType from '@apeleghq/http-media-type-negotiator';

const available = [
  'text/plain; charset=utf-8',
  'application/json',
];

const best = negotiateMediaType(available, 'text/*;q=0.9, application/json;q=0.8');
// best -> 'text/plain; charset=utf-8'
```

#### Reusable negotiator (recommended for repeated calls)

Create a negotiator once for a fixed set of server-supported media types to
avoid reparsing:

```javascript
import negotiateMediaTypeFactory from '@apeleghq/http-media-type-negotiator';

const available = [
  'text/plain; charset=utf-8',
  'application/json',
];

const negotiate = negotiateMediaTypeFactory(available);

// Later, for each request:
const best1 = negotiate('application/json');
const best2 = negotiate('text/*;q=0.9, application/json;q=0.8');
```

#### Permissive mode

Pass the optional permissive flag to tolerate non-RFC-compliant inputs
(extra whitespace, empty parameter values, flag parameters like `;foo`, and
truncated quoted values at EOF):

```javascript
const best = negotiate(acceptHeader, true); // permissive parsing
```

### ⚙️ Behaviour notes

- Returned strings are the original server-provided strings from the
  `availableMediaTypes` array.
- Q-values are parsed and converted to integer weights between **0** and
  **1000** (1.0 → 1000). Entries with `q=0` are ignored.
- Matching supports exact `type/subtype`, type with wildcard subtype
  (e.g. `text/*`), and `*/*`.
- When multiple acceptable ranges tie on `q`, the negotiator prefers:
  1. More specific type/subtype (non-`*`),
  2. Media-range that shares the most non-q parameters with the available type,
  3. Server order (the order of available types provided).
- The parser returns substrings for `Accept` entries and reparses them into
  structured media types internally; this keeps the implementation
  allocation-light.
- Parameter values are _not_ normalised and evaluated as exact matches
  (meaning case-sensitively).

### ✅ Recommended usage pattern

- If negotiating repeatedly for the same server-supported types, use
  `negotiateMediaTypeFactory` once and reuse the returned function to avoid
  reparsing available types.
- Normalise case if you need canonical string comparisons beyond what the
  negotiator provides.

### 🤝 Contributing

Contributions welcome. Please open issues or pull requests on the repository.
Consider adding unit tests for edge cases and performance benchmarks if you
change parsing behaviour.

### 📜 License

This project is released under the ISC license. See the `LICENSE` file
for details.
