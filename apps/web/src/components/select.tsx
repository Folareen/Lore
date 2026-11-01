'use client';
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type OptionHTMLAttributes,
  type ReactNode,
} from 'react';
import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
// Radix reserves an empty value for placeholders. Optional empty choices need a
// separate UI value; the named hidden input submits the original domain value.
const emptyValue = '__lore_empty_option__';
type Props = Omit<
  ComponentProps<typeof Primitive.Trigger>,
  'children' | 'value' | 'defaultValue' | 'onChange'
> & {
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
};
export function Select({
  children,
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  className = '',
  ...triggerProps
}: Props) {
  const options = Children.toArray(children).map((child) => {
    if (
      !isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child) ||
      child.type !== 'option'
    )
      throw new Error('Select children must be options.');
    return {
      value: String(child.props.value ?? ''),
      label: child.props.children,
      disabled: child.props.disabled,
    };
  });
  const initial = String(defaultValue ?? options[0]?.value ?? '');
  const [local, setLocal] = useState(initial);
  const [open, setOpen] = useState(false);
  const current = value === undefined ? local : String(value);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const form = trigger.current?.form;
    function reset() {
      setLocal(initial);
    }
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [initial]);
  const encode = (v: string) => (v === '' && !required ? emptyValue : v);
  const placeholder = options.find((option) => option.value === '')?.label;
  return (
    <Primitive.Root
      open={open}
      onOpenChange={setOpen}
      value={encode(current)}
      required={required}
      disabled={disabled}
      onValueChange={(next) => {
        const decoded = next === emptyValue ? '' : next;
        setLocal(decoded);
        onValueChange?.(decoded);
      }}
    >
      <Primitive.Trigger
        {...triggerProps}
        ref={trigger}
        value={current}
        className={`select-trigger ${className}`}
      >
        <Primitive.Value placeholder={placeholder} />
        <Primitive.Icon asChild>
          <ChevronDown size={17} aria-hidden="true" />
        </Primitive.Icon>
      </Primitive.Trigger>
      {name && (
        <input type="hidden" name={name} value={current} disabled={disabled} />
      )}
      <Primitive.Portal
        container={
          trigger.current?.closest<HTMLDialogElement>('dialog') ?? undefined
        }
      >
        <div>
          {open && <div className="select-scrim" aria-hidden="true" />}
          <Primitive.Content
            className="select-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Primitive.ScrollUpButton className="select-scroll">
              <ChevronUp size={16} />
            </Primitive.ScrollUpButton>
            <Primitive.Viewport className="select-viewport">
              {options
                .filter((option) => !(required && option.value === ''))
                .map((option) => (
                  <Primitive.Item
                    className="select-option"
                    key={option.value}
                    value={encode(option.value)}
                    data-value={option.value}
                    disabled={option.disabled}
                  >
                    <Primitive.ItemText>{option.label}</Primitive.ItemText>
                    <Primitive.ItemIndicator className="select-check">
                      <Check size={16} aria-hidden="true" />
                    </Primitive.ItemIndicator>
                  </Primitive.Item>
                ))}
            </Primitive.Viewport>
            <Primitive.ScrollDownButton className="select-scroll">
              <ChevronDown size={16} />
            </Primitive.ScrollDownButton>
          </Primitive.Content>
        </div>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
