import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { controlClass } from './field';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  invalid?: boolean;
  className?: string;
};

/**
 * The design-system `<textarea>`. Same surface as `Input` via `controlClass`,
 * but multiline: it drops the fixed height, grows, and stays resize-y. Control-
 * level like `Input`, so it drops in wherever a raw `<textarea className=
 * {controlClass({ multiline: true })}>` used to be.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={controlClass({ invalid, multiline: true, className })}
      {...rest}
    />
  );
});
