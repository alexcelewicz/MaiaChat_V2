import type { Metadata } from "next";
import { db } from "@/lib/db";
import { conversations, messages as messagesTable } from "@/lib/db/schema";
import { eq, asc, isNull, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, User, Bot, Calendar, Clock, Lock } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
    },
};

interface SharedPageProps {
    params: Promise<{ token: string }>;
}

export default async function SharedConversationPage({ params }: SharedPageProps) {
    const { token } = await params;

    // Find conversation by share token
    const conversation = await db.query.conversations.findFirst({
        where: and(
            eq(conversations.shareToken, token),
            isNull(conversations.deletedAt)
        ),
    });

    if (!conversation) {
        notFound();
    }

    // Fetch messages
    const conversationMessages = await db.query.messages.findMany({
        where: eq(messagesTable.conversationId, conversation.id),
        orderBy: [asc(messagesTable.createdAt)],
    });

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
            {/* Header */}
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                <div className="container max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <MessageSquare className="h-6 w-6 text-primary" />
                            <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-transparent bg-clip-text">
                                MAIAChat
                            </span>
                        </div>
                        <Badge variant="secondary" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Shared View
                        </Badge>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="container max-w-4xl mx-auto px-4 py-8">
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="text-2xl">{conversation.title}</CardTitle>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                            <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                Created: {conversation.createdAt.toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                Updated: {conversation.updatedAt.toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <MessageSquare className="h-4 w-4" />
                                {conversationMessages.length} messages
                            </span>
                        </div>
                    </CardHeader>
                </Card>

                <div className="space-y-6">
                    {conversationMessages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-4 ${
                                message.role === "user" ? "flex-row-reverse" : ""
                            }`}
                        >
                            <Avatar className="h-8 w-8 shrink-0">
                                <AvatarFallback
                                    className={
                                        message.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                    }
                                >
                                    {message.role === "user" ? (
                                        <User className="h-4 w-4" />
                                    ) : (
                                        <Bot className="h-4 w-4" />
                                    )}
                                </AvatarFallback>
                            </Avatar>

                            <Card
                                className={`flex-1 max-w-[85%] ${
                                    message.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted/50"
                                }`}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-medium text-sm">
                                            {message.role === "user" ? "User" : "Assistant"}
                                        </span>
                                        <span className="text-xs opacity-70">
                                            {message.createdAt.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div
                                        className={
                                            message.role === "user"
                                                ? "text-primary-foreground"
                                                : "prose prose-sm dark:prose-invert max-w-none"
                                        }
                                    >
                                        {message.role === "user" ? (
                                            <p className="whitespace-pre-wrap">{message.content}</p>
                                        ) : (
                                            <MarkdownRenderer content={message.content} />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ))}
                </div>

                {conversationMessages.length === 0 && (
                    <Card className="text-center py-12">
                        <CardContent>
                            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">
                                This conversation is empty.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </main>

            {/* Footer */}
            <footer className="border-t py-6 mt-12">
                <div className="container max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
                    <p>
                        Shared via{" "}
                        <span className="font-semibold text-foreground">MAIAChat</span>
                    </p>
                    <p className="mt-1">
                        This is a read-only view of a shared conversation.
                    </p>
                </div>
            </footer>
        </div>
    );
}
