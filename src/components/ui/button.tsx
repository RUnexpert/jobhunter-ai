import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants = cva('btn', {
  variants: {
    variant: {
      default: 'btn-primary',
      outline: 'btn-outline',
      ghost: 'btn-ghost',
      destructive: 'btn-danger',
    },
    size: { default: '', sm: 'btn-sm' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {
  asChild?: boolean;
}
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={twMerge(clsx(variants({ variant, size }), className))} {...props} />;
}
