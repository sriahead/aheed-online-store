# Requirements: Global 500 Error Boundary

## 1. Context & Objective
Resolves #459. When production configuration is missing, the application fails closed cleanly at the configuration boundary, but the user is presented with a generic browser 500 page or Next.js fallback because no root error boundary exists to catch the error. We need a branded error boundary to handle application crashes gracefully.

## 2. Scope
- `app/global-error.tsx`: The root boundary catching errors in `app/layout.tsx`.
- `app/error.tsx`: The boundary catching errors in nested routes, preserving the site layout.

## 3. Requirements

### R1. Root Error Recovery (`global-error.tsx`)
- Must define its own `<html>` and `<body>` elements, as it replaces the root layout.
- Must present a clean, branded "Something went wrong" message.
- Must provide a "Try Again" button that calls the provided `reset()` function.
- Must *not* expose raw error messages or stack traces to the user.
- Should log the raw error to `console.error` for observability.

### R2. Nested Error Recovery (`error.tsx`)
- Must present the same branded message and "Try Again" button.
- Must render within the existing layout (does not define `<html>` or `<body>`).
- Must *not* expose raw error messages to the user.

### R3. Visual Consistency
- The UI must use the existing design system (e.g., standard buttons, typography, `AlertTriangle` icon from `lucide-react`).

### R4. Complete Coverage
- These two boundaries must act as the absolute catch-all for **all** unhandled runtime exceptions in the application. There are no exclusions for specific routes or layouts.
