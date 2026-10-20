---
"industrial-model": patch
---

Fix nested relation pagination when the root view has no next page. When an expanded relation filled its internal page (10,000 rows), the follow-up query dropped ancestor expressions that had no cursor of their own, such as the root on its last page, and Cognite rejected it with `Referencing undefined table expression`. Follow-up queries now keep every ancestor (on its current page, without returning its rows again) and every expression nested under the paged relation, so all related rows are fetched exactly once.
