import { useNavigate } from "@tanstack/react-router";
import type { Impact } from "@/lib/dashboard-data";

interface ChipItem {
  id: string;
  impact: Impact;
  nodeCount: number;
}

export function DetailsChipPanel({
  chips,
  activeRuleId,
  auditId,
}: {
  chips: ChipItem[];
  activeRuleId: string;
  auditId: string;
}) {
  const navigate = useNavigate();

  function handleChip(ruleId: string) {
    void navigate({
      to: "/audits/$auditId/$ruleId",
      params: { auditId, ruleId },
      replace: true,
    });
  }

  return (
    <fieldset className="impact-filters" aria-label="Issues found on this page">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="fchip"
          aria-pressed={chip.id === activeRuleId}
          onClick={() => handleChip(chip.id)}
        >
          <span className={`dot dot--${chip.impact}`} aria-hidden="true" />
          {chip.id}
          <span className="num">{chip.nodeCount}</span>
        </button>
      ))}
    </fieldset>
  );
}
