'use client'

import React, { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { JobPosition } from '@/lib/job-categories'

interface PositionComboboxProps {
  positions: JobPosition[]
  value: string
  onChange: (value: string) => void
  /** Chưa chọn ngành thì khoá lại, kèm lời nhắc chọn ngành trước */
  disabled?: boolean
}

/**
 * Chọn vị trí chuyên môn. Dùng combobox có ô tìm kiếm thay vì Select thường
 * vì một ngành có thể tới hơn 20 vị trí, cuộn tay rất mỏi.
 */
export default function PositionCombobox({
  positions,
  value,
  onChange,
  disabled,
}: PositionComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = positions.find((p) => p.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {selected
              ? selected.label
              : disabled
                ? 'Chọn ngành nghề trước'
                : 'Tìm và chọn vị trí'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Nhập tên vị trí..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy vị trí phù hợp.</CommandEmpty>
            <CommandGroup>
              {positions.map((p) => (
                <CommandItem
                  key={p.value}
                  value={p.label}
                  onSelect={() => {
                    // Bấm lại đúng mục đang chọn thì bỏ chọn
                    onChange(p.value === value ? '' : p.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      value === p.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
