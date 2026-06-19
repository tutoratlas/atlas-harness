import { useCallback } from "react";
import type { Student } from "@t3tools/contracts";

import { Button } from "../ui/button";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";

export interface StudentListProps {
  students: readonly Student[];
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string) => void;
  onNewStudent: () => void;
}

export function StudentList({
  students,
  selectedStudentId,
  onSelectStudent,
  onNewStudent,
}: StudentListProps) {
  // Sort students alphabetically by name
  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));

  const handleStudentClick = useCallback(
    (studentId: string) => {
      onSelectStudent(studentId);
    },
    [onSelectStudent],
  );

  // Empty state when no students exist
  if (students.length === 0) {
    return (
      <SidebarContent className="overflow-x-hidden">
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
          <p className="text-sm text-muted-foreground">No students yet</p>
          <Button size="sm" variant="outline" onClick={onNewStudent}>
            Add your first student
          </Button>
        </div>
      </SidebarContent>
    );
  }

  // Render student list
  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup className="px-2 py-3">
        <SidebarMenu>
          {sortedStudents.map((student) => {
            const isActive = selectedStudentId === student.id;
            return (
              <SidebarMenuItem key={student.id}>
                <SidebarMenuButton
                  size="sm"
                  isActive={isActive}
                  className={
                    isActive
                      ? "gap-2.5 px-2.5 py-2 text-left text-[13px] font-medium text-foreground"
                      : "gap-2.5 px-2.5 py-2 text-left text-[13px] text-muted-foreground/70 hover:text-foreground/80"
                  }
                  onClick={() => handleStudentClick(student.id)}
                >
                  <span className="truncate">{student.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
