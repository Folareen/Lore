// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { selectValue } from '../test/select-value';
import { Select } from './select';
afterEach(cleanup);
it('submits empty and selected values correctly, and resets an uncontrolled field', async () => {
  const view = render(
    <form>
      <label>
        Assignee
        <Select name="assignee">
          <option value="">Unassigned</option>
          <option value="moss">Moss</option>
          <option value="cozy" disabled>
            Cozy
          </option>
        </Select>
      </label>
      <button type="reset">Reset</button>
    </form>,
  );
  const form = view.container.querySelector('form')!;
  expect(new FormData(form).get('assignee')).toBe('');
  const user = userEvent.setup();
  await selectValue(
    user,
    screen.getByRole('combobox', { name: /Assignee/ }),
    'moss',
  );
  expect(new FormData(form).get('assignee')).toBe('moss');
  await user.click(screen.getByRole('button', { name: 'Reset' }));
  expect(new FormData(form).get('assignee')).toBe('');
});
it('keeps required placeholder fields invalid until a real option is chosen', async () => {
  const view = render(
    <form>
      <label>
        Case
        <Select name="case" required>
          <option value="">Choose a case</option>
          <option value="garden">Garden</option>
        </Select>
      </label>
    </form>,
  );
  const form = view.container.querySelector('form')!;
  expect(form.checkValidity()).toBe(false);
  await selectValue(
    userEvent.setup(),
    screen.getByRole('combobox', { name: /Case/ }),
    'garden',
  );
  expect(form.checkValidity()).toBe(true);
  expect(new FormData(form).get('case')).toBe('garden');
});
it('supports keyboard selection and Escape without committing a highlighted option', async () => {
  render(
    <label>
      Role
      <Select defaultValue="team">
        <option value="team">Team member</option>
        <option value="moderator">Moderator</option>
      </Select>
    </label>,
  );
  const user = userEvent.setup();
  const trigger = screen.getByRole('combobox', { name: /Role/ });
  trigger.focus();
  await user.keyboard('{ArrowDown}{End}{Enter}');
  expect((trigger as HTMLButtonElement).value).toBe('moderator');
  await user.keyboard('{ArrowDown}{Home}{Escape}');
  expect((trigger as HTMLButtonElement).value).toBe('moderator');
  expect(document.activeElement).toBe(trigger);
});
