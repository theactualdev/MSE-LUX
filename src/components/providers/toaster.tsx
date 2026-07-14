"use client"

import type { ReactNode } from "react"
import { Toast as ToastPrimitive, type ToastManagerAddOptions } from "@base-ui/react/toast"

import {
  ToastClose,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

/**
 * A manager created outside React so `toast(...)` can be called from plain
 * event handlers and non-component code, not only from inside a component
 * that calls the `useToastManager` hook. Passed into `ToastProvider` below so
 * the mounted `<Toaster>` renders whatever it queues.
 */
export const toastManager = ToastPrimitive.createToastManager()

/** Queue a toast from anywhere client-side, e.g. `toast({ title: 'Added to bag' })`. */
export function toast(options: ToastManagerAddOptions<Record<string, unknown>>): string {
  return toastManager.add(options)
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return (
    <>
      {toasts.map((item) => (
        <ToastRoot key={item.id} toast={item}>
          <ToastTitle />
          <ToastDescription />
          <ToastClose />
        </ToastRoot>
      ))}
    </>
  )
}

interface ToasterProps {
  children?: ReactNode
}

/**
 * App-wide toast host: mount once near the root (see `AppShell`). Wraps
 * `children` in the Base UI toast context and renders the portal + viewport
 * that the shared `toastManager` feeds.
 */
export function Toaster({ children }: ToasterProps) {
  return (
    <ToastProvider toastManager={toastManager} limit={3}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}
