import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Desktop Sidebar */}
            <aside className="hidden md:block w-72 flex-shrink-0">
                <Sidebar className="h-full" />
            </aside>

            {/* Main Content Area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <Header />

                <main className="flex-1 flex flex-col relative z-0 focus:outline-none min-h-0 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
