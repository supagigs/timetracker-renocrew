"use client";

import Image from "next/image";
import * as React from "react";

type AvatarProps = React.HTMLAttributes<HTMLDivElement> & {
  fallback?: string;
};

export function Avatar({ children, className = "", ...props }: AvatarProps) {
  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

type AvatarImageProps = {
  src?: string | null;
  alt?: string;
  className?: string;
};

export function AvatarImage({ src, alt = "Avatar", className = "" }: AvatarImageProps) {
  if (!src) {
    return null;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="40px"
      className={`object-cover ${className}`}
    />
  );
}

type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement>;

export function AvatarFallback({ className = "", children, ...props }: AvatarFallbackProps) {
  return (
    <span
      className={`flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}


