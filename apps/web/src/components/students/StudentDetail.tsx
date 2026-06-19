"use client";

import { useState } from "react";
import {
  ExternalLinkIcon,
  FolderIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
} from "lucide-react";
import type { Student } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { readLocalApi } from "~/localApi";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { whatsAppLink, telegramLink, googleMapsLink } from "./links";

export interface StudentDetailProps {
  readonly student: Student;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function StudentDetail({ student, onEdit, onDelete }: StudentDetailProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { handleNewThread, defaultProjectRef } = useHandleNewThread();

  const handleDelete = async () => {
    const localApi = readLocalApi();
    if (!localApi) return;

    const confirmed = await localApi.dialogs.confirm(
      `Delete student "${student.name}"? This action cannot be undone.`,
    );
    if (confirmed) {
      onDelete();
    }
  };

  const handleDeepLink = (url: string) => {
    if (url) {
      const localApi = readLocalApi();
      if (!localApi) return;
      void localApi.shell.openExternal(url).catch(() => undefined);
    }
  };

  // Plan 23: ensure the student's on-disk materials workspace exists, then open
  // a session rooted at that folder so the agent reads its AGENTS.md harness.
  const handleGenerateMaterials = async () => {
    if (!window.desktopBridge) {
      toastManager.add({
        title: "Desktop app required",
        description: "Materials workspace is only available in the desktop app.",
        type: "error",
      });
      return;
    }

    if (!defaultProjectRef) {
      toastManager.add({
        title: "No project available",
        description: "No environment or project is configured. Please set up a project first.",
        type: "error",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const result = await window.desktopBridge.ensureStudentWorkspace({
        studentId: student.id,
      });

      if (!result.success || !result.workspacePath) {
        throw new Error(result.error || "Failed to create workspace");
      }

      toastManager.add({
        title: "Workspace created",
        description: `Materials workspace ready at ${result.workspacePath}`,
        type: "success",
        data: { dismissAfterVisibleMs: 3000 },
      });

      await handleNewThread(defaultProjectRef, {
        worktreePath: result.workspacePath,
      });

      toastManager.add({
        title: "Session started",
        description: `Ready to generate materials for ${student.name}`,
        type: "success",
        data: { dismissAfterVisibleMs: 3000 },
      });
    } catch (error) {
      console.error("Failed to generate materials:", error);
      toastManager.add({
        title: "Failed to generate materials",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const studentWhatsAppUrl = whatsAppLink(student.phone);
  const studentTelegramUrl = telegramLink(student.phone);
  const addressMapsUrl = googleMapsLink(student.address);

  return (
    <div className="flex h-full flex-col">
      {/* Header with actions */}
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">{student.name}</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleGenerateMaterials}
            disabled={isGenerating}
          >
            <FolderIcon className="size-4" />
            {isGenerating ? "Creating workspace…" : "Generate materials"}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          {/* Phone */}
          {student.phone && (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <PhoneIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Phone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {student.phone.country === "SG" ? "+65" : student.phone.country === "MY" ? "+60" : student.phone.country === "CN" ? "+86" : ""} {student.phone.number}
                </span>
                <div className="flex gap-1">
                  {studentWhatsAppUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={() => handleDeepLink(studentWhatsAppUrl)}
                    >
                      <MessageCircleIcon className="size-3" />
                      WhatsApp
                    </Button>
                  )}
                  {studentTelegramUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={() => handleDeepLink(studentTelegramUrl)}
                    >
                      <ExternalLinkIcon className="size-3" />
                      Telegram
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Subjects */}
          {student.subjects && student.subjects.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Subjects</span>
              <div className="flex flex-wrap gap-2">
                {student.subjects.map((subject, index) => (
                  <span
                    key={index}
                    className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-foreground"
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* School */}
          {student.school && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">School</span>
              <span className="text-sm text-muted-foreground">{student.school}</span>
            </div>
          )}

          {/* Address */}
          {student.address && (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Address</span>
              </div>
              <div className="space-y-1">
                {student.address.block && (
                  <div className="text-sm text-muted-foreground">Block {student.address.block}</div>
                )}
                {student.address.street && (
                  <div className="text-sm text-muted-foreground">{student.address.street}</div>
                )}
                {student.address.building && (
                  <div className="text-sm text-muted-foreground">{student.address.building}</div>
                )}
                {student.address.unit && (
                  <div className="text-sm text-muted-foreground">Unit {student.address.unit}</div>
                )}
                {student.address.postalCode && (
                  <div className="text-sm text-muted-foreground">
                    Singapore {student.address.postalCode}
                  </div>
                )}
                {addressMapsUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => handleDeepLink(addressMapsUrl)}
                  >
                    <MapPinIcon className="size-3" />
                    Open in Google Maps
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Parents */}
          {student.parents && student.parents.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Parents</span>
              <div className="space-y-3">
                {student.parents.map((parent, index) => {
                  const parentWhatsAppUrl = whatsAppLink(parent.phone);
                  const parentTelegramUrl = telegramLink(parent.phone);

                  return (
                    <div
                      key={index}
                      className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
                    >
                      {parent.name && (
                        <div className="text-sm font-medium text-foreground">{parent.name}</div>
                      )}
                      {parent.relationship && (
                        <div className="text-xs text-muted-foreground">{parent.relationship}</div>
                      )}
                      {parent.phone && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {parent.phone.country === "SG" ? "+65" : parent.phone.country === "MY" ? "+60" : parent.phone.country === "CN" ? "+86" : ""} {parent.phone.number}
                          </span>
                          <div className="flex gap-1">
                            {parentWhatsAppUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 gap-1 px-1.5 text-xs"
                                onClick={() => handleDeepLink(parentWhatsAppUrl)}
                              >
                                <MessageCircleIcon className="size-3" />
                                WhatsApp
                              </Button>
                            )}
                            {parentTelegramUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 gap-1 px-1.5 text-xs"
                                onClick={() => handleDeepLink(parentTelegramUrl)}
                              >
                                <ExternalLinkIcon className="size-3" />
                                Telegram
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {student.notes && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Notes</span>
              <div className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                {student.notes}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid gap-1.5 border-t border-border/60 pt-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Created:</span>
              <span>{new Date(student.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Last updated:</span>
              <span>{new Date(student.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
