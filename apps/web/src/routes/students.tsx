import { PlusIcon } from "lucide-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Student } from "@t3tools/contracts";

import { Button } from "../components/ui/button";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { ensureLocalApi } from "../localApi";
import { StudentList } from "../components/students/StudentList";
import { StudentDetail } from "../components/students/StudentDetail";
import { StudentForm } from "../components/students/StudentForm";
import { getPrimaryEnvironmentConnection } from "../environments/runtime/service";

type RightPaneView = "welcome" | "detail" | "create" | "edit";

function StudentsContentLayout() {
  const [students, setStudents] = useState<readonly Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [rightPaneView, setRightPaneView] = useState<RightPaneView>("welcome");

  // Load roster on mount and subscribe to live updates
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const loadStudents = async () => {
      try {
        const localApi = ensureLocalApi();
        const loadedStudents = await localApi.persistence.getStudents();
        setStudents(loadedStudents);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial load
    void loadStudents();

    // Subscribe to WS updates if available
    try {
      const connection = getPrimaryEnvironmentConnection();
      if (connection?.client?.students?.subscribeStudents) {
        unsubscribe = connection.client.students.subscribeStudents(
          async () => {
            // On studentsChanged event, refetch the roster
            try {
              const localApi = ensureLocalApi();
              const loadedStudents = await localApi.persistence.getStudents();
              setStudents(loadedStudents);
            } catch (error) {
              // Silent fail - keep existing state on refetch error
            }
          },
          {
            onResubscribe: () => {
              // On reconnect, refetch to sync state
              void loadStudents();
            },
          },
        );
      }
    } catch (error) {
      // WS not available - gracefully fall back to one-shot load
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Persist students to storage
  const persistStudents = useCallback(async (updatedStudents: readonly Student[]) => {
    try {
      const localApi = ensureLocalApi();
      await localApi.persistence.setStudents(updatedStudents);
      setStudents(updatedStudents);
    } catch (error) {
      // Silent fail - student list in memory remains consistent
    }
  }, []);

  // Handler: Select a student from the list
  const handleSelectStudent = useCallback((studentId: string) => {
    setSelectedStudentId(studentId);
    setRightPaneView("detail");
  }, []);

  // Handler: New Student button
  const handleNewStudent = useCallback(() => {
    setSelectedStudentId(null);
    setRightPaneView("create");
  }, []);

  // Handler: Edit button from detail view
  const handleEdit = useCallback(() => {
    setRightPaneView("edit");
  }, []);

  // Handler: Save from form (create or edit)
  const handleSave = useCallback(
    async (student: Student) => {
      if (rightPaneView === "create") {
        // Add new student to roster
        let finalStudent = student;

        // R4: Ensure student workspace folder exists
        if (window.desktopBridge) {
          try {
            const result = await window.desktopBridge.ensureStudentWorkspace({
              name: student.name,
              id: student.id,
            });
            if (result.success && result.workspaceFolder) {
              finalStudent = { ...student, workspaceFolder: result.workspaceFolder };
            }
          } catch (error) {
            // Silent fail - continue without workspaceFolder
          }
        }

        const updatedStudents = [...students, finalStudent];
        await persistStudents(updatedStudents);
        setSelectedStudentId(finalStudent.id);
        setRightPaneView("detail");
      } else if (rightPaneView === "edit") {
        // Update existing student
        const updatedStudents = students.map((s) => (s.id === student.id ? student : s));
        await persistStudents(updatedStudents);
        setRightPaneView("detail");
      }
    },
    [rightPaneView, students, persistStudents],
  );

  // Handler: Cancel from form
  const handleCancel = useCallback(() => {
    if (selectedStudentId) {
      setRightPaneView("detail");
    } else {
      setRightPaneView("welcome");
    }
  }, [selectedStudentId]);

  // Handler: Delete from detail view
  const handleDelete = useCallback(async () => {
    if (!selectedStudentId) return;

    const student = students.find((s) => s.id === selectedStudentId);
    if (!student) return;

    // R4: Handle student workspace folder deletion
    if (window.desktopBridge && student.workspaceFolder) {
      const localApi = ensureLocalApi();
      const confirmed = await localApi.dialogs.confirm(
        `Delete student "${student.name}" and workspace folder "${student.workspaceFolder}"? This action cannot be undone.`,
      );
      if (!confirmed) return;

      try {
        await window.desktopBridge.deleteStudentWorkspace({
          workspaceFolder: student.workspaceFolder,
        });
      } catch (error) {
        // Silent fail - continue with roster removal
      }
    }

    const updatedStudents = students.filter((s) => s.id !== selectedStudentId);
    await persistStudents(updatedStudents);
    setSelectedStudentId(null);
    setRightPaneView("welcome");
  }, [selectedStudentId, students, persistStudents]);

  // Find selected student
  const selectedStudent = selectedStudentId
    ? students.find((s) => s.id === selectedStudentId)
    : undefined;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Students</span>
              <div className="ms-auto flex items-center gap-2">
                <Button size="xs" variant="outline" onClick={handleNewStudent}>
                  <PlusIcon className="mx-1 size-3.5" />
                  New Student
                </Button>
              </div>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5 wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Students
            </span>
            <div className="ms-auto flex items-center gap-2">
              <Button size="xs" variant="outline" onClick={handleNewStudent}>
                <PlusIcon className="mx-1 size-3.5" />
                New Student
              </Button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex flex-1">
          {/* Two-pane split layout */}
          <div className="flex min-h-0 flex-1">
            {/* Left pane: Student list */}
            <div className="border-r border-border w-80 min-h-0 flex flex-col">
              {isLoading ? (
                <div className="flex items-center justify-center h-full p-4">
                  <div className="text-sm text-muted-foreground">Loading students...</div>
                </div>
              ) : (
                <StudentList
                  students={students}
                  selectedStudentId={selectedStudentId}
                  onSelectStudent={handleSelectStudent}
                  onNewStudent={handleNewStudent}
                />
              )}
            </div>

            {/* Right pane: Detail/Form */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {rightPaneView === "welcome" && (
                  <div className="flex h-full items-center justify-center p-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-sm text-muted-foreground">
                        Select a student from the list to view details
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        or click "New Student" to add a new student
                      </p>
                    </div>
                  </div>
                )}

                {rightPaneView === "detail" && selectedStudent && (
                  <StudentDetail
                    student={selectedStudent}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                )}

                {rightPaneView === "create" && (
                  <div className="p-6">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-foreground">New Student</h2>
                    </div>
                    <StudentForm mode="create" onSave={handleSave} onCancel={handleCancel} />
                  </div>
                )}

                {rightPaneView === "edit" && selectedStudent && (
                  <div className="p-6">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-foreground">
                        Edit {selectedStudent.name}
                      </h2>
                    </div>
                    <StudentForm
                      mode="edit"
                      initialStudent={selectedStudent}
                      onSave={handleSave}
                      onCancel={handleCancel}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

function StudentsRouteLayout() {
  return <StudentsContentLayout />;
}

export const Route = createFileRoute("/students")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: StudentsRouteLayout,
});
