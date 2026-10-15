import { forwardRef, type InputHTMLAttributes } from 'react';
import { controlClass } from './field';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> & {
  invalid?: boolean;
  /** Compact controls (toolbars, dense tables) drop to h-10; default h-11. */
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * The design-system `<input>`. A thin wrapper over the native control that
 * always applies `controlClass`, so every text field in the app shares one
 * surface (border, radius, shadow, focus ring). It stays control-level on
 * purpose: callers keep their own `FieldShell` for label/error, which keeps it
 * a drop-in for the raw `<input className={controlClass()}>` it replaces.
 */
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { invalid, size = 'md', className, ...rest },
  ref,
) {
  return <input ref={ref} className={controlClass({ invalid, size, className })} {...rest} />;
});
