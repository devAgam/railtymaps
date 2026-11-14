import { createElement } from 'react';
import { ICONS, type IconName } from '../lib/ui/icons';

interface Props {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Give it a label only when the icon carries meaning on its own. */
  label?: string;
}

export function Icon({ name, size = 16, strokeWidth = 2, label }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
