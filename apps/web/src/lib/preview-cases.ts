import type { CaseDetail, CaseAiRun } from '@lore/shared';
export { previewCases } from '@lore/shared';
export function previewPrecedents(
  record: CaseDetail,
  records: CaseDetail[],
): CaseAiRun {
  const prior = records.filter(
    (r) =>
      r.channelId === record.channelId &&
      r.id !== record.id &&
      r.status === 'decided' &&
      r.ruleTitle === record.ruleTitle,
  );
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    error: null,
    caseVersion: record.version,
    createdAt: new Date().toISOString(),
    indexedCount: prior.length,
    eligibleCount: prior.length,
    stale: false,
    matches: prior.map((p) => ({
      case: {
        id: p.id,
        channelId: p.channelId,
        title: p.title,
        subjectReference: p.subjectReference,
        status: p.status,
        version: p.version,
        origin: p.origin,
        ruleTitle: p.ruleTitle,
        ruleVersion: p.ruleVersion,
        outcome: p.outcome,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      rationale: p.rationale!,
      followUp: p.followUp || '',
      incident: p.incident,
      ruleText: p.ruleText,
      similarity: 0.82,
    })),
    recommendation: prior.length
      ? {
          task_type: 'case_review',
          proposed_action: 'modify',
          summary:
            'Check the timing and clarity of the reminder before deciding whether the timeout was proportionate.',
          source_record_ids: [record.id, ...prior.map((p) => p.id)],
          comparisons: prior.map((p) => ({
            case_id: p.id,
            similarities:
              'Both cases concern a location spoiler and a request to review a timeout.',
            differences:
              'This case mentions an earlier reminder; the precedent used a different rule version and had no clear reminder.',
          })),
          evidence_gaps: [
            'Full chat context and timeout duration are missing.',
          ],
          uncertainties: [
            'The viewer’s understanding cannot be established from these notes.',
          ],
          requires_human_approval: true,
          suggested_next_step:
            'Review the exact messages and rule version, then record your own decision.',
        }
      : null,
  };
}
