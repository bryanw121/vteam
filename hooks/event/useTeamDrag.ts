import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import type { ZoneLayout } from '../../types'
import type { ViewInstance } from 'react-native'

/**
 * Drag-a-player-onto-a-team for the People tab. The card's pan gesture reports
 * absolute pointer coords; this hook moves the floating ghost, hit-tests the
 * team drop zones (measured once at drag start, ±24px slop) and calls
 * `onDrop(playerId, team)` — `null` team = the Unassigned zone.
 *
 * `containerRef` goes on the screen's root view: on native the ghost is
 * absolutely positioned inside it, so its window offset is subtracted. On web
 * the ghost is `position: fixed` in viewport coords and needs no offset.
 */
export function useTeamDrag(onDrop: (playerId: string, team: number | null) => void) {
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null)
  const [hoveredTeamKey, setHoveredTeamKey] = useState<string | null>(null)
  const ghostX = useSharedValue(-500)
  const ghostY = useSharedValue(-500)
  const containerOffsetX = useSharedValue(0)
  const containerOffsetY = useSharedValue(0)
  const draggingRef = useRef<string | null>(null)
  const containerRef = useRef<ViewInstance>(null)
  const teamZoneRefs = useRef<Record<string, ViewInstance | null>>({})
  const zoneLayouts = useRef<Record<string, ZoneLayout>>({})
  /** True while dragging: the inner tab Pager must not claim the gesture. */
  const pagerBlockedRef = useRef(false)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    pagerBlockedRef.current = draggingPlayerId !== null
  }, [draggingPlayerId])

  function measureContainerOffset() {
    if (Platform.OS === 'web') {
      const rect = (containerRef.current as unknown as HTMLElement | null)?.getBoundingClientRect?.()
      if (rect) {
        containerOffsetX.value = rect.left
        containerOffsetY.value = rect.top
      }
    } else {
      containerRef.current?.measure((_x, _y, _w, _h, px, py) => {
        containerOffsetX.value = px
        containerOffsetY.value = py
      })
    }
  }

  const zoneAt = (y: number): string | null => {
    for (const [key, zone] of Object.entries(zoneLayouts.current)) {
      if (y >= zone.top && y <= zone.bottom) return key
    }
    return null
  }

  function onDragStart(playerId: string, x: number, y: number) {
    measureContainerOffset()
    draggingRef.current = playerId
    ghostX.value = x
    ghostY.value = y
    setDraggingPlayerId(playerId)
    // Snapshot every drop zone's layout once; hit-testing during the drag is pure math.
    Object.entries(teamZoneRefs.current).forEach(([key, ref]) => {
      ref?.measure((_x, _y, _w, h, _px, py) => {
        zoneLayouts.current[key] = { top: py - 24, bottom: py + h + 24 }
      })
    })
  }

  function onDragMove(x: number, y: number) {
    ghostX.value = x
    ghostY.value = y
    setHoveredTeamKey(zoneAt(y))
  }

  function onDragEnd(_x: number, y: number) {
    const playerId = draggingRef.current
    if (playerId) {
      const key = zoneAt(y)
      if (key !== null) onDropRef.current(playerId, key === 'unassigned' ? null : parseInt(key, 10))
    }
    draggingRef.current = null
    setDraggingPlayerId(null)
    setHoveredTeamKey(null)
    ghostX.value = -500
    ghostY.value = -500
  }

  const ghostStyle = useAnimatedStyle(() => ({
    left: Platform.OS === 'web' ? ghostX.value - 80 : ghostX.value - containerOffsetX.value - 80,
    top: Platform.OS === 'web' ? ghostY.value - 28 : ghostY.value - containerOffsetY.value - 28,
  }))

  return {
    containerRef,
    measureContainerOffset,
    teamZoneRefs,
    pagerBlockedRef,
    draggingPlayerId,
    hoveredTeamKey,
    ghostStyle,
    onDragStart,
    onDragMove,
    onDragEnd,
  }
}

