// Finance › Cost to company (2026-10-12, SRS 21): for admins only, always (not grantable). Like the
// Support tab before it, it starts by asking: what should cost to company show, and what would
// help decide? Answers are saved as Help feedback about Finance (seen by admins only).
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { IconCoin } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { FeedbackForm } from '../help/FeedbackForm';

export function FinancePage() {
  return (
    <div className="space-y-4">
      <PageHead
        title="Cost to company"
        sub="Coming soon: what the work costs, by project, team and person"
        icon={<IconCoin size={24} />}
      />
      <SortableGroup
        group="finance.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          {
            id: 'quote',
            className: 'xl:col-span-5',
            node: (
              <div className="relative h-full overflow-hidden rounded-card bg-primary p-6 text-white">
                <p className="relative font-heading text-label font-bold uppercase text-primary-soft">
                  We need your insights
                </p>
                <blockquote className="relative mt-4 font-heading text-title">
                  “What gets measured gets managed.”
                </blockquote>
                <p className="relative mt-2 text-accent">Peter Drucker</p>
                <p className="relative mt-6 text-body text-white">
                  Cost to company will show what each project, team and person costs against what
                  they deliver. Tell us what you want to see first, what decisions it should help
                  with, and which figures you track by hand today.
                </p>
              </div>
            ),
          },
          {
            id: 'form',
            className: 'xl:col-span-7',
            node: (
              <Card
                title="Share your needs"
                info="Saved as feedback about Finance; only admins read it."
              >
                <FeedbackForm
                  fixed="finance"
                  placeholder="What should Cost to company show? Which decisions should it help with? What do you calculate by hand today?"
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
