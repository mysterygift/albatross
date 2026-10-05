import { Toaster as SonnerToaster, toast, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="system"
      position="bottom-right"
      richColors
      closeButton
      // Phones: sit above the iPhone tab bar when it is showing (the variable is unset otherwise).
      mobileOffset={{ bottom: 'calc(var(--phone-tab-bar-space, 0px) + 16px)' }}
      toastOptions={{
        classNames: {
          toast: 'bg-card text-card-foreground border-border',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Toaster, toast }
