import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/admin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const adminCheck = await isAdmin();
    
    if (!adminCheck) {
        redirect("/chat");
    }

    return (
        <div className="flex h-screen">
            <AdminSidebar />
            <main className="flex-1 overflow-auto bg-muted/30">
                {children}
            </main>
        </div>
    );
}
