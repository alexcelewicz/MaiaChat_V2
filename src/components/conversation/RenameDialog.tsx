"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface RenameDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initialValue: string;
    onConfirm: (newValue: string) => Promise<void>;
    isLoading?: boolean;
}

export function RenameDialog({
    isOpen,
    onOpenChange,
    title,
    initialValue,
    onConfirm,
    isLoading = false,
}: RenameDialogProps) {
    const [value, setValue] = useState(initialValue);

    // Reset value when dialog opens or initialValue changes
    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
        }
    }, [isOpen, initialValue]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        await onConfirm(value);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Enter a new name below.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name" className="sr-only">
                                Name
                            </Label>
                            <Input
                                id="name"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                autoFocus
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!value.trim() || isLoading}>
                            {isLoading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
