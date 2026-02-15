import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-lg text-center">
        <CardHeader>
          <div className="mx-auto mb-4">
            <div className="relative">
              <span className="text-8xl font-bold text-muted-foreground/20">404</span>
              <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Page Not Found</CardTitle>
          <CardDescription className="text-base">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground">
            The page might have been removed, had its name changed, or is temporarily unavailable.
          </p>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full" size="lg">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go to Homepage
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href="/chat">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Start a Chat
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
