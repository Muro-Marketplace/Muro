// Twitter reads its own file convention: an `opengraph-image` does not
// populate `twitter:image`. Rather than maintain a second design, this
// re-exports the Open Graph card so the two can never drift.
export { default, alt, size, contentType } from "./opengraph-image";
