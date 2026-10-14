# Drawing into flex parents: free-space drawing — SUPERSEDED

Superseded by `2026-09-04-flex-sizing-contract-plan.md` before any code was
written.

This plan proposed constraining the draw gesture to a flex parent's
free space so a line could never be over-committed. Comparing how Figma
(parent grows — which is just CSS `fit-content` behaviour) and Paper
(`flex-shrink: 0` on every child + `overflow: clip` on the parent,
drawn freely) resolve the same tension showed a simpler shape: keep the
draw free, make the sizing rules legible, and fix how Fill is spelled —
`flex: 1` instead of the shrink-dependent `width: 100%` that caused the
sidebar bug in the first place.

One idea from this plan survives independently: deriving the insertion
index from the draw position (draw between two children → land between
them). It is carried as an open question in the superseding plan.
