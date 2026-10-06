# Noélia main read model mapping

This Root-side contract is a read-only UI boundary. A later transport adapter
can map these existing Noélia types into `domain/academyProfile.ts`; this
prototype does not call main services or a database.

| Root read model | Existing Noélia contract | Mapping notes |
| --- | --- | --- |
| `AcademyStageProgress` | `BalletAcademyProgress` and `BalletAcademyRank` in `src/ballet/academy.ts` | Current/next ranks and unmet requirements are derived from Ballet level, completed activity codes, selected stats, and best performance tiers. There is no persisted enrollment or stage row. |
| `BalletProgression` and `BalletSkills` | `BalletProgressStatus` and `BalletStats` in `src/ballet/types.ts` | Level, total XP, XP to next level, and the six stat keys are existing fields. |
| `TrainingStatus` | `BalletActivityView` in `src/ballet/types.ts` | Activity availability is `AVAILABLE`, `LOCKED`, or `COOLDOWN`; level/stat/activity/equipment requirements and cooldown timestamps are already resolved by the domain service. Root should display these values without reproducing the rules. |
| `AssessmentSummary` | `BalletPerformanceResult` in `src/performance/types.ts` | Existing completed performances provide ID, name, score, tier, and completion time. `ProfileSummary` does not currently aggregate performance history. |
| `EquippedOutfit` | `WardrobeOutfitItem` and `WardrobeSlot` in `src/wardrobe/types.ts` | Equipped items have catalog ID, display name, one or more occupied slots, and equipped time. |
| `WardrobeSummary.academyUniform` | `AcademyUniformStatus` in `src/ballet/uniform.ts` | The current uniform read model exposes readiness, rank/level, and leotard/tights/shoes requirements. It is not an inventory adapter. |

`ProfileSummary` in `src/profile/types.ts` is the main existing read-only
aggregator for profile, Ballet progression, wardrobe, Academy rank, and uniform
status. Its implementation composes domain ports in `src/profile/profile-service.ts`.

The inspected checkout has migration files `001` through `020`, including
Ballet progression/stat migrations `004` and `008`, performance migration
`009`, Academy V1 migration `018`, and uniform migrations `019`–`020`. It has no
Academy V3, Training V3, or Academy V4 migration file in this checkout.

The inspected source does not define Academy enrollment, scheduled classes,
class effects, recovery, attendance/check-in, or report-card records. Those
concepts are deliberately absent from the Root domain contract. Performance
results are supported assessment-like records; rank advancement remains the
derived Academy rule in Noélia main. A real adapter should add no Root-side
business rules and should only expose future concepts once main defines them.

Wardrobe layer mapping lives in `avatar/wardrobeLayerAdapter.ts`. Existing
equipment slots map to Root render buckets; the current Noélia slot model has
no base, hair, or foreground-effect equipment slots, and item IDs still need
an approved visual asset mapping before equipped items can be rendered.
