import assert from "node:assert/strict";
import test from "node:test";
import {
  extendedDirectionControlCopy,
  extendedHoursColumnLabel,
  extendedHoursDisplayCopy,
  risingExtendedLabel,
} from "@/lib/ross/presentation";

test("regular session keeps retained pre-market labels without stale wording", () => {
  const asOf = "2026-08-13T15:05:00Z";
  const copy = extendedHoursDisplayCopy("regular", "premarket", asOf);

  assert.equal(extendedHoursColumnLabel("regular", asOf), "Gap (PM)");
  assert.equal(risingExtendedLabel("regular", asOf), "Rising pre-mkt");
  assert.equal(copy.label, "Gap (PM)");
  assert.equal(copy.cue, "gap today");
  assert.match(copy.title, /retained pre-market gap context/i);
  assert.match(copy.title, /not a live extended-hours signal/i);
  assert.ok(!/stale/i.test(copy.title));
});

test("same-day post-close research window keeps after-hours labels", () => {
  const asOf = "2026-08-14T00:25:00Z";
  const copy = extendedHoursDisplayCopy("closed", "afterhours", asOf);

  assert.equal(extendedHoursColumnLabel("closed", asOf), "After-hrs %");
  assert.equal(risingExtendedLabel("closed", asOf), "Rising after-hrs");
  assert.equal(copy.label, "AH Move");
  assert.match(copy.title, /same-day post-close/i);
});

test("overnight and weekend sessions stay neutral", () => {
  const overnight = "2026-08-14T04:30:00Z";
  const weekend = "2026-08-16T14:00:00Z";

  assert.equal(extendedHoursColumnLabel("closed", overnight), "Ext. hrs");
  assert.equal(risingExtendedLabel("closed", overnight), "Rising ext. hrs");
  assert.equal(extendedHoursColumnLabel("weekend", weekend), "Ext. hrs");
  assert.equal(risingExtendedLabel("weekend", weekend), "Rising ext. hrs");
});

test("regular-session control copy explains context and ranking", () => {
  const copy = extendedDirectionControlCopy(
    "regular",
    "2026-08-13T15:05:00Z",
  );

  assert.match(copy.hint, /context\/ranking/i);
  assert.match(copy.detail, /retained pre-market gap/i);
  assert.match(copy.detail, /not a live extended-hours signal/i);
  assert.equal(copy.statusEnabled, "📊 PM gap context/ranking");
});
