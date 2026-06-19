"use client";

import { XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { PhoneField, type PhoneValue } from "./PhoneField";

export interface ParentInfo {
  readonly name: string;
  readonly relationship: string;
  readonly phone: PhoneValue | undefined;
}

export interface ParentRowsProps {
  readonly parents: ReadonlyArray<ParentInfo>;
  readonly onChange: (parents: ReadonlyArray<ParentInfo>) => void;
}

export function ParentRows({ parents, onChange }: ParentRowsProps) {
  const handleAddParent = () => {
    onChange([
      ...parents,
      {
        name: "",
        relationship: "",
        phone: undefined,
      },
    ]);
  };

  const handleRemoveParent = (index: number) => {
    onChange(parents.filter((_, i) => i !== index));
  };

  const handleUpdateParent = (index: number, updates: Partial<ParentInfo>) => {
    onChange(
      parents.map((parent, i) =>
        i === index
          ? {
              ...parent,
              ...updates,
            }
          : parent,
      ),
    );
  };

  return (
    <div className="space-y-4">
      {parents.map((parent, index) => (
        <div
          key={index}
          className="rounded-lg border border-border/60 bg-background p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Parent {index + 1}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleRemoveParent(index)}
              aria-label="Remove parent"
            >
              <XIcon />
            </Button>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`parent-${index}-name`}>Name</Label>
              <Input
                id={`parent-${index}-name`}
                value={parent.name}
                onChange={(event) =>
                  handleUpdateParent(index, { name: event.target.value })
                }
                placeholder="Parent name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`parent-${index}-relationship`}>
                Relationship
              </Label>
              <Input
                id={`parent-${index}-relationship`}
                value={parent.relationship}
                onChange={(event) =>
                  handleUpdateParent(index, {
                    relationship: event.target.value,
                  })
                }
                placeholder="e.g. Mother, Father"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`parent-${index}-phone`}>
                Phone (optional)
              </Label>
              <PhoneField
                value={parent.phone}
                onChange={(phone) => handleUpdateParent(index, { phone })}
              />
            </div>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={handleAddParent}>
        Add parent
      </Button>
    </div>
  );
}
