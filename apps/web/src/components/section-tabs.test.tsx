// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionTabs } from './section-tabs';
afterEach(cleanup);
it('supports keyboard navigation, loads tools on demand and preserves a draft between tabs', async () => {
  const load = vi.fn();
  function Tools() {
    useEffect(load, []);
    return <p>Ready to use</p>;
  }
  function Harness() {
    const [tab, setTab] = useState('draft');
    return (
      <SectionTabs
        label="Tasks"
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: 'draft',
            label: 'Draft',
            content: (
              <label>
                Title
                <input />
              </label>
            ),
          },
          { value: 'tools', label: 'Tools', content: <Tools /> },
        ]}
      />
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Title'), 'Keep my title');
  expect(load).not.toHaveBeenCalled();
  screen.getByRole('tab', { name: 'Draft' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Tools' })).toHaveProperty(
    'ariaSelected',
    'true',
  );
  expect(document.activeElement).toBe(
    screen.getByRole('tab', { name: 'Tools' }),
  );
  expect(load).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('tabpanel').textContent).toContain('Ready to use');
  await user.keyboard('{Home}');
  expect(screen.getByLabelText('Title')).toHaveProperty(
    'value',
    'Keep my title',
  );
  await user.keyboard('{End}');
  expect(load).toHaveBeenCalledTimes(1);
});
