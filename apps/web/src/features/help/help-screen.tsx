'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageTitle } from '../../components/page-title';
import { SectionTabs } from '../../components/section-tabs';
import { useWorkspace } from '../workspace/workspace-context';
import { guides, audiences, guideViews, demoGuideHref } from './guides';
import { GuideContent } from './guide-content';
export function HelpScreen() {
  const { selected, preview, href } = useWorkspace();
  const params = useSearchParams();
  const [audience, setAudience] = useState<string>(
    audiences.find((key) => key === params.get('audience')) ??
      (selected?.role === 'moderator' ? 'moderators' : 'streamers'),
  );
  return (
    <div className="content-stack help-screen">
      <PageTitle>Help & guides</PageTitle>
      <p className="muted">
        Choose what you use Lore for.{' '}
        {preview
          ? 'The links below open working examples in this demo.'
          : 'Start with a task, then open its screen when you are ready.'}
      </p>
      <SectionTabs
        label="Who is this guide for?"
        value={audience}
        onValueChange={setAudience}
        tabs={audiences.map((key) => ({
          value: key,
          label: guides[key].label,
          content: (
            <GuideContent
              audience={key}
              href={(view) =>
                preview ? demoGuideHref(view) : href(guideViews[view])
              }
            />
          ),
        }))}
      />
    </div>
  );
}
