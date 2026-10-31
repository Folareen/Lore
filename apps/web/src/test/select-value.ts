import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
export async function selectValue(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  value: string,
) {
  await user.click(trigger);
  const options = await screen.findAllByRole('option');
  const option = options.find((item) => item.dataset.value === value);
  if (!option) throw new Error(`Missing select option: ${value}`);
  await user.click(option);
}
