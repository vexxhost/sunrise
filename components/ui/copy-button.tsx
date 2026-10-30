"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button, type ButtonProps } from "@/components/ui/button"

type CopyButtonProps = Omit<ButtonProps, "children" | "loading"> & {
  /** Text written to the clipboard. */
  value: string
  /** Accessible name and tooltip, for example "Copy endpoint". */
  label?: string
  /** Shown and announced for a moment after a successful copy. */
  copiedLabel?: string
  /** Render the label as visible text next to the icon. */
  showLabel?: boolean
  /** How long the copied state lasts, in milliseconds. */
  timeout?: number
  onCopy?: (value: string) => void
  /** Called when the browser refuses clipboard access. */
  onError?: (error: unknown) => void
}

function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  showLabel = false,
  timeout = 2000,
  onCopy,
  onError,
  onClick,
  variant = "ghost",
  size,
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const handleClick: NonNullable<ButtonProps["onClick"]> = async (event) => {
    onClick?.(event)
    try {
      await navigator.clipboard.writeText(value)
    } catch (error) {
      onError?.(error)
      return
    }
    setCopied(true)
    onCopy?.(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), timeout)
  }

  const current = copied ? copiedLabel : label

  return (
    <Button
      type="button"
      data-slot="copy-button"
      data-copied={copied ? "" : undefined}
      variant={variant}
      size={size ?? (showLabel ? "default" : "icon-sm")}
      aria-label={label}
      title={current}
      className={className}
      onClick={handleClick}
      {...props}
    >
      {copied ? <CheckIcon className="text-status-success" /> : <CopyIcon />}
      {showLabel && current}
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </Button>
  )
}

export { CopyButton, type CopyButtonProps }
