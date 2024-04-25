import { Server as ServerProviders } from '@/components/Providers/Server'
import { Client as ClientProviders } from '@/components/Providers/Client'

export function Providers({children}: { children: React.ReactNode }) {
    return <ServerProviders><ClientProviders>
        {children}
    </ClientProviders></ServerProviders>
}
