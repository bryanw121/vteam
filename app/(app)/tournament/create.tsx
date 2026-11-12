import React, { useState, useCallback, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { Text, TextInput } from '../../../components/ui/Text'
import { useRouter, Stack } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../contexts/session'
import { theme, shared, SKILL_LEVEL_LABELS } from '../../../constants'
import { routes } from '../../../utils/routes'
import { DatePickerField } from '../../../components/DatePickerField'
import { notifyError, notifyInfo } from '../../../utils/notify'
import type { TournamentDraft, TournamentFormat, TournamentBracketType, Club } from '../../../types'
import { TIEBREAKER_LABELS } from '../../../constants/tournamentCopy'
import { DEFAULT_TIEBREAKERS } from '../../../lib/tournamentStandings'
import { IconButton } from '../../../components/ui'
import { Spinner } from '../../../components/ui/Spinner'

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

const DEFAULT_DRAFT: TournamentDraft = {
  title: '',
  clubId: '',
  location: '',
  skillLevels: [],
  startDate: null,
  registrationDeadline: null,
  description: '',
  format: 'pool_bracket',
  bracketType: 'single',
  teamsAdvancePerPool: 2,
  maxTeams: null,
  minRosterSize: 6,
  maxRosterSize: 10,
  hasRefs: false,
  price: 0,
  venmoHandle: '',
  startingScore: 0,
  winningScore: 25,
  decidingSetScore: 15,
  winByMargin: 2,
  pointCap: null,
  setsToWin: 2,
  tiebreakers: [...DEFAULT_TIEBREAKERS],
  thirdPlaceMatch: false,
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Basics', 'Format', 'Registration', 'Rules', 'Preview']

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 0 }}>
      {STEP_LABELS.map((label, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={{ height: 1, width: 24, backgroundColor: done ? theme.colors.primary : theme.colors.border }} />
            )}
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: active ? theme.colors.primary : done ? theme.colors.primarySoft : theme.colors.card,
                borderWidth: active || done ? 0 : 1,
                borderColor: theme.colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {done
                  ? <Ionicons name="checkmark" size={14} color={theme.colors.primary} />
                  : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.xs, color: active ? theme.colors.onPrimary : theme.colors.subtext }}>{i + 1}</Text>
                }
              </View>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: active ? theme.colors.primary : theme.colors.subtext, letterSpacing: 0.3 }}>
                {label}
              </Text>
            </View>
          </React.Fragment>
        )
      })}
    </View>
  )
}

// ─── Shared form components ───────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 6 }}>
      <Ionicons name={icon} size={13} color={theme.colors.subtext} />
      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, letterSpacing: 1, textTransform: 'uppercase', color: theme.colors.subtext }}>
        {label}
      </Text>
    </View>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  )
}

function TextBox({
  value, onChangeText, placeholder, multiline, keyboardType, style,
}: {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  multiline?: boolean
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'
  style?: object
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.subtext}
      multiline={multiline}
      keyboardType={keyboardType ?? 'default'}
      style={[{
        backgroundColor: theme.colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontFamily: theme.fonts.body,
        fontSize: theme.font.size.md,
        color: theme.colors.text,
        minHeight: multiline ? 80 : undefined,
        textAlignVertical: multiline ? 'top' : undefined,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
      }, style]}
    />
  )
}

function NumericStepper({ value, onChange, min = 0, max = 99 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="remove" size={16} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg, color: theme.colors.text, minWidth: 40, textAlign: 'center' }}>{value}</Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="add" size={16} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  )
}

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{label}</Text>
        {sub && <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{sub}</Text>}
      </View>
      <View style={{
        width: 44, height: 26, borderRadius: 13,
        backgroundColor: value ? theme.colors.primary : theme.colors.border,
        justifyContent: 'center', paddingHorizontal: 3,
      }}>
        <View style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.white,
          transform: [{ translateX: value ? 18 : 0 }],
        }} />
      </View>
    </TouchableOpacity>
  )
}

// ─── Step 1: Basic Info ───────────────────────────────────────────────────────

function StepBasicInfo({ draft, update, clubs }: {
  draft: TournamentDraft
  update: (patch: Partial<TournamentDraft>) => void
  clubs: Club[]
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 0 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="trophy-outline" label="Tournament Info" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Tournament name">
          <TextBox value={draft.title} onChangeText={v => update({ title: v })} placeholder="e.g. Summer Slam 2026" />
        </Field>
        <Field label="Description">
          <TextBox value={draft.description} onChangeText={v => update({ description: v })} placeholder="What should players know?" multiline />
        </Field>
      </View>

      <SectionLabel icon="people-outline" label="Club" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Associate with club">
          {clubs.length === 0
            ? <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext }}>You must be a club member to host a tournament.</Text>
            : <View style={{ gap: 8 }}>
                {clubs.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => update({ clubId: c.id })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      padding: 12, borderRadius: 12,
                      backgroundColor: draft.clubId === c.id ? theme.colors.primarySoft : theme.colors.background,
                      borderWidth: 1.5,
                      borderColor: draft.clubId === c.id ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{c.name}</Text>
                    {draft.clubId === c.id && <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
          }
        </Field>
      </View>

      <SectionLabel icon="stats-chart-outline" label="Skill Level" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {Object.entries(SKILL_LEVEL_LABELS).map(([id, label]) => ({ id: id as (typeof draft.skillLevels)[number], label })).map(opt => {
          const active = draft.skillLevels.includes(opt.id)
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => update({
                skillLevels: active
                  ? draft.skillLevels.filter(l => l !== opt.id)
                  : [...draft.skillLevels, opt.id],
              })}
              activeOpacity={0.75}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                borderWidth: 1.5,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: active ? theme.colors.primary : theme.colors.text }}>{opt.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <SectionLabel icon="location-outline" label="When & Where" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Location">
          <TextBox value={draft.location} onChangeText={v => update({ location: v })} placeholder="Gym name, address…" />
        </Field>
        <Field label="Start date & time">
          <DatePickerField
            value={draft.startDate}
            onChange={d => update({ startDate: d })}
            placeholder="Pick a date"
          />
        </Field>
        <Field label="Registration deadline">
          <DatePickerField
            value={draft.registrationDeadline}
            onChange={d => update({ registrationDeadline: d })}
            placeholder="Optional"
          />
        </Field>
      </View>
    </ScrollView>
  )
}

// ─── Step 2: Format ───────────────────────────────────────────────────────────

type FormatOption = { id: TournamentFormat; icon: string; label: string; description: string }
const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'pool_bracket', icon: '🏊🏆', label: 'Pool Play + Bracket',  description: 'Group stage, then elimination' },
  { id: 'bracket',      icon: '🏆',    label: 'Bracket Only',         description: 'Single or double elimination' },
  { id: 'pool_play',    icon: '🏊',    label: 'Pool Play Only',       description: 'Round robin within pools' },
  { id: 'round_robin',  icon: '🔄',    label: 'Full Round Robin',     description: 'Everyone plays everyone' },
]

function StepFormat({ draft, update }: { draft: TournamentDraft; update: (p: Partial<TournamentDraft>) => void }) {
  const hasBracket = draft.format === 'pool_bracket' || draft.format === 'bracket'
  const hasPool    = draft.format === 'pool_bracket' || draft.format === 'pool_play'

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="grid-outline" label="Tournament Format" />
      <View style={{ gap: 10, marginBottom: 20 }}>
        {FORMAT_OPTIONS.map(opt => {
          const active = draft.format === opt.id
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => update({ format: opt.id })}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                padding: 16, borderRadius: 16,
                backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                borderWidth: 2,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ fontSize: theme.font.emoji.xl }}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.text }}>{opt.label}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{opt.description}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />}
            </TouchableOpacity>
          )
        })}
      </View>

      {hasBracket && (
        <>
          <SectionLabel icon="git-network-outline" label="Bracket Type" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {([
              { id: 'single' as TournamentBracketType, icon: '→', label: 'Single Elimination', sub: 'One loss and you\'re out' },
              { id: 'double' as TournamentBracketType, icon: '⇉', label: 'Double Elimination', sub: 'Two losses to be eliminated' },
            ]).map(opt => {
              const active = draft.bracketType === opt.id
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => update({ bracketType: opt.id })}
                  activeOpacity={0.8}
                  style={{
                    flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', gap: 6,
                    backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                    borderWidth: 2, borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: theme.font.emoji.lg }}>{opt.icon}</Text>
                  <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text, textAlign: 'center' }}>{opt.label}</Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, textAlign: 'center' }}>{opt.sub}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      {hasPool && (
        <>
          <SectionLabel icon="podium-outline" label="Pool Advancement" />
          <View style={[shared.card, { marginBottom: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Teams that advance per pool</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>Top N teams move to the next stage</Text>
              </View>
              <NumericStepper value={draft.teamsAdvancePerPool} onChange={v => update({ teamsAdvancePerPool: v })} min={1} max={8} />
            </View>
          </View>
        </>
      )}

      <SectionLabel icon="flag-outline" label="Officiating" />
      <Toggle
        value={draft.hasRefs}
        onChange={v => update({ hasRefs: v })}
        label="Enable referee rotation"
        sub="3 teams per match slot — 2 playing, 1 reffing"
      />
    </ScrollView>
  )
}

// ─── Step 3: Registration ─────────────────────────────────────────────────────

function StepRegistration({ draft, update }: { draft: TournamentDraft; update: (p: Partial<TournamentDraft>) => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="people-outline" label="Teams" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Max teams</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>Leave empty for unlimited</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => update({ maxTeams: null })}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: draft.maxTeams === null ? theme.colors.primarySoft : theme.colors.background, borderWidth: 1, borderColor: draft.maxTeams === null ? theme.colors.primary : theme.colors.border }}
            >
              <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.xs, color: draft.maxTeams === null ? theme.colors.primary : theme.colors.subtext }}>∞</Text>
            </TouchableOpacity>
            <NumericStepper
              value={draft.maxTeams ?? 8}
              onChange={v => update({ maxTeams: v })}
              min={2} max={128}
            />
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 16 }} />

        <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.subtext, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>Roster size</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Minimum players</Text>
          <NumericStepper value={draft.minRosterSize} onChange={v => update({ minRosterSize: Math.min(v, draft.maxRosterSize) })} min={1} max={draft.maxRosterSize} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Maximum players</Text>
          <NumericStepper value={draft.maxRosterSize} onChange={v => update({ maxRosterSize: Math.max(v, draft.minRosterSize) })} min={draft.minRosterSize} max={20} />
        </View>
      </View>

      <SectionLabel icon="cash-outline" label="Fees" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Field label="Entry fee per team ($)">
          <TextBox
            value={draft.price === 0 ? '' : String(draft.price)}
            onChangeText={v => update({ price: parseFloat(v) || 0 })}
            placeholder="0 = free"
            keyboardType="decimal-pad"
          />
        </Field>
        {draft.price > 0 && (
          <Field label="Venmo handle (optional)">
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.background }}>
              <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm + 2, borderRightWidth: 1, borderRightColor: theme.colors.border }}>
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>@</Text>
              </View>
              <TextInput
                value={draft.venmoHandle}
                onChangeText={v => update({ venmoHandle: v.replace(/^@/, '') })}
                placeholder="your-venmo-username"
                placeholderTextColor={theme.colors.subtext}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.sm + 2,
                  fontSize: theme.font.size.md,
                  color: theme.colors.text,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
            </View>
          </Field>
        )}
      </View>
    </ScrollView>
  )
}

// ─── Step 4: Rules ────────────────────────────────────────────────────────────

function StepRules({ draft, update }: { draft: TournamentDraft; update: (p: Partial<TournamentDraft>) => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      <SectionLabel icon="book-outline" label="Set Scoring" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        {([
          { key: 'startingScore',   label: 'Starting score',          sub: 'e.g. 0 or 4 for a 4-4 start', min: 0, max: 20 },
          { key: 'winningScore',    label: 'Points to win a set',     sub: 'e.g. 25',                     min: 5, max: 50 },
          { key: 'decidingSetScore',label: 'Deciding set target',     sub: 'e.g. 15 for the 5th set',     min: 5, max: 30 },
          { key: 'winByMargin',     label: 'Win-by margin',           sub: 'e.g. 2 (win by 2)',           min: 1, max: 5 },
        ] as { key: keyof TournamentDraft; label: string; sub: string; min: number; max: number }[]).map((row, i, arr) => (
          <View key={row.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{row.label}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>{row.sub}</Text>
              </View>
              <NumericStepper
                value={draft[row.key] as number}
                onChange={v => update({ [row.key]: v })}
                min={row.min} max={row.max}
              />
            </View>
            {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: theme.colors.border }} />}
          </View>
        ))}
      </View>

      <SectionLabel icon="trophy-outline" label="Match Format" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Sets to win a match</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 2 }}>Best of {draft.setsToWin * 2 - 1}</Text>
          </View>
          <NumericStepper value={draft.setsToWin} onChange={v => update({ setsToWin: v })} min={1} max={3} />
        </View>
      </View>

      <SectionLabel icon="remove-circle-outline" label="Point Cap" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Toggle
          value={draft.pointCap !== null}
          onChange={v => update({ pointCap: v ? 30 : null })}
          label="Enable point cap"
          sub="Set ends when cap is reached regardless of win-by"
        />
        {draft.pointCap !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>Cap at</Text>
            <NumericStepper value={draft.pointCap} onChange={v => update({ pointCap: v })} min={draft.winningScore} max={60} />
          </View>
        )}
      </View>

      <SectionLabel icon="podium-outline" label="Tie Rules" />
      <View style={[shared.card, { marginBottom: 16 }]}>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginBottom: 8 }}>
          Teams rank by wins. When they're level, these break the tie, top first. Teams level on all of them share the place.
        </Text>
        {draft.tiebreakers.map((key, i) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
            <Text style={{ width: 22, fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.subtext }}>{i + 1}</Text>
            <Text style={{ flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>{TIEBREAKER_LABELS[key]}</Text>
            <IconButton icon="chevron-up" size={44} label={`Move ${TIEBREAKER_LABELS[key]} up`} onPress={() => update({ tiebreakers: moveItem(draft.tiebreakers, i, -1) })} />
            <IconButton icon="chevron-down" size={44} label={`Move ${TIEBREAKER_LABELS[key]} down`} onPress={() => update({ tiebreakers: moveItem(draft.tiebreakers, i, 1) })} />
          </View>
        ))}
        {(draft.format === 'pool_bracket' || draft.format === 'bracket') && draft.bracketType === 'single' && (
          <View style={{ marginTop: 12 }}>
            <Toggle
              value={draft.thirdPlaceMatch}
              onChange={v => update({ thirdPlaceMatch: v })}
              label="Play a third-place match"
              sub="Off: both semifinal losers share third place"
            />
          </View>
        )}
      </View>
    </ScrollView>
  )
}

/** A copy with item `i` moved one step up (-1) or down (1). */
function moveItem<T>(items: readonly T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (j < 0 || j >= items.length) return [...items]
  const next = [...items]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// ─── Step 5: Preview ──────────────────────────────────────────────────────────

function PreviewRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <Ionicons name={icon} size={16} color={theme.colors.subtext} />
      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, width: 110 }}>{label}</Text>
      <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.text, flex: 1 }}>{value}</Text>
    </View>
  )
}

const FORMAT_LABELS: Record<string, string> = {
  pool_bracket: 'Pool Play + Bracket',
  bracket:      'Bracket Only',
  pool_play:    'Pool Play Only',
  round_robin:  'Round Robin',
}

function StepPreview({ draft, clubs, onSaveDraft, onPublish, saving }: {
  draft: TournamentDraft
  clubs: Club[]
  onSaveDraft: () => void
  onPublish: () => void
  saving: boolean
}) {
  const club = clubs.find(c => c.id === draft.clubId)
  const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      {/* Banner card */}
      <View style={{
        backgroundColor: theme.colors.primary, borderRadius: 20, padding: 20, marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -10, top: -20 }}>
          <Text style={{ fontSize: theme.font.watermark.lg, opacity: 0.12 }}>🏆</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.accent }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk }}>
              {draft.startDate ? fmtDate(draft.startDate) : 'Date TBD'}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.85)' }}>
              🏆 {FORMAT_LABELS[draft.format]}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.xl, letterSpacing: -0.6, color: theme.colors.onPrimary, lineHeight: 28 }}>
          {draft.title || 'Untitled Tournament'}
        </Text>
        {draft.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: 'rgba(255,255,255,0.6)' }}>{draft.location}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.75)' }}>
              {draft.price > 0 ? `$${draft.price} entry` : 'Free entry'}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: 'rgba(255,255,255,0.75)' }}>
              {draft.maxTeams ? `Up to ${draft.maxTeams} teams` : 'Unlimited teams'}
            </Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={[shared.card, { marginBottom: 16 }]}>
        <PreviewRow icon="people-outline"      label="Club"               value={club?.name ?? '—'} />
        <PreviewRow icon="calendar-outline"    label="Registration closes" value={fmtDate(draft.registrationDeadline)} />
        <PreviewRow icon="git-network-outline" label="Bracket"            value={draft.bracketType === 'double' ? 'Double elimination' : 'Single elimination'} />
        <PreviewRow icon="people-outline"      label="Roster size"        value={`${draft.minRosterSize}–${draft.maxRosterSize} players`} />
        <PreviewRow icon="flag-outline"        label="Refs"               value={draft.hasRefs ? 'Rotation enabled' : 'No refs'} />
      </View>

      <View style={[shared.card, { marginBottom: 24 }]}>
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, letterSpacing: 1, textTransform: 'uppercase', color: theme.colors.subtext, marginBottom: 8 }}>Scoring Rules</Text>
        <PreviewRow icon="remove-outline"       label="Starting score"  value={`${draft.startingScore}–${draft.startingScore}`} />
        <PreviewRow icon="flag-outline"         label="Win a set"       value={`${draft.winningScore} pts (win by ${draft.winByMargin})`} />
        <PreviewRow icon="star-outline"         label="Deciding set"    value={`${draft.decidingSetScore} pts`} />
        <PreviewRow icon="trophy-outline"       label="Match format"    value={`Best of ${draft.setsToWin * 2 - 1}`} />
        <PreviewRow icon="podium-outline"       label="Tiebreakers"     value={draft.tiebreakers.map(k => TIEBREAKER_LABELS[k]).join(' → ')} />
        {draft.pointCap !== null && (
          <PreviewRow icon="close-circle-outline" label="Point cap"     value={`${draft.pointCap} pts`} />
        )}
      </View>

      {/* Action buttons */}
      <View style={{ gap: 10 }}>
        <TouchableOpacity
          onPress={onPublish}
          disabled={saving}
          style={{ backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' }}
        >
          {saving
            ? <Spinner color={theme.colors.onPrimary} />
            : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.onPrimary }}>Publish Tournament</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSaveDraft}
          disabled={saving}
          style={{ backgroundColor: theme.colors.card, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}
        >
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.lgs, color: theme.colors.text }}>Save as Draft</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center', paddingHorizontal: 20 }}>
          Drafts are only visible to you. You can publish any time from the tournament page.
        </Text>
      </View>
    </ScrollView>
  )
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateStep(step: number, draft: TournamentDraft): string | null {
  if (step === 0) {
    if (!draft.title.trim())  return 'Please enter a tournament name.'
    if (!draft.clubId)        return 'Please select a club.'
    if (!draft.startDate)     return 'Please set a start date.'
  }
  if (step === 2) {
    if (draft.minRosterSize > draft.maxRosterSize) return 'Min roster cannot exceed max.'
  }
  return null
}

// ─── Save helpers ─────────────────────────────────────────────────────────────

async function saveTournament(draft: TournamentDraft, status: 'draft' | 'published', userId: string): Promise<string> {
  const { data: t, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      club_id:                draft.clubId,
      created_by:             userId,
      title:                  draft.title.trim(),
      description:            draft.description.trim() || null,
      location:               draft.location.trim() || null,
      skill_levels:           draft.skillLevels,
      start_date:             draft.startDate!.toISOString(),
      registration_deadline:  draft.registrationDeadline?.toISOString() ?? null,
      status,
      format:                 draft.format,
      bracket_type:           (draft.format === 'pool_bracket' || draft.format === 'bracket') ? draft.bracketType : null,
      max_teams:              draft.maxTeams,
      min_roster_size:        draft.minRosterSize,
      max_roster_size:        draft.maxRosterSize,
      teams_advance_per_pool: draft.teamsAdvancePerPool,
      has_refs:               draft.hasRefs,
      price:                  draft.price,
      venmo_handle:           draft.price > 0 ? (draft.venmoHandle.trim() || null) : null,
      published_at:           status === 'published' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (tErr) throw tErr

  const { error: rErr } = await supabase
    .from('tournament_rules')
    .insert({
      tournament_id:       t.id,
      starting_score:      draft.startingScore,
      winning_score:       draft.winningScore,
      deciding_set_score:  draft.decidingSetScore,
      win_by_margin:       draft.winByMargin,
      point_cap:           draft.pointCap,
      sets_to_win:         draft.setsToWin,
      // Only sent when changed, so creating still works on a database without these columns.
      ...(draft.tiebreakers.join() !== DEFAULT_TIEBREAKERS.join() ? { tiebreakers: draft.tiebreakers } : {}),
      ...(draft.thirdPlaceMatch && draft.bracketType === 'single' ? { third_place_match: true } : {}),
    })

  if (rErr) {
    // A tournament without rules renders a half-empty page; undo the insert (best effort) and report the real error.
    await supabase.from('tournaments').delete().eq('id', t.id)
    throw rErr
  }
  return t.id
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function TournamentCreateScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId } = useSession()

  const [step, setStep]     = useState(0)
  const [draft, setDraft]   = useState<TournamentDraft>(DEFAULT_DRAFT)
  const [clubs, setClubs]   = useState<Club[]>([])
  const [saving, setSaving] = useState(false)

  const update = useCallback((patch: Partial<TournamentDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }))
  }, [])

  useEffect(() => {
    async function loadClubs() {
      if (!userId) return
      const { data, error } = await supabase
        .from('club_members')
        .select('clubs (id, name, description, membership_type, created_by, avatar_url, cover_url, major_city_id, created_at)')
        .eq('user_id', userId)
      if (error) { notifyInfo('Could not load your clubs', error.message); return }
      const fetched = (data ?? []).map((r: any) => r.clubs).filter(Boolean) as Club[]
      setClubs(fetched)
      if (fetched.length === 1) update({ clubId: fetched[0].id })
    }
    void loadClubs()
  }, [update, userId])

  function goNext() {
    const err = validateStep(step, draft)
    if (err) { notifyInfo('Missing info', err); return }
    setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  function goBack() {
    if (step === 0) { router.canGoBack() ? router.back() : router.replace(routes.app()); return }
    setStep(s => s - 1)
  }

  async function handleSave(status: 'draft' | 'published') {
    const err = validateStep(step, draft)
    if (err) { notifyInfo('Missing info', err); return }
    if (!userId) { notifyInfo('Sign in required', 'Sign in to create a tournament.'); return }
    setSaving(true)
    try {
      const id = await saveTournament(draft, status, userId)
      router.replace(routes.tournament(id))
    } catch (e: any) {
      notifyError('Could not save tournament', e)
    } finally {
      setSaving(false)
    }
  }

  const isLastStep = step === TOTAL_STEPS - 1

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header */}
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 4,
        paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <TouchableOpacity onPress={goBack} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: theme.colors.text }}>
            Create Tournament
          </Text>
          <View style={{ width: 32 }} />
        </View>
        <StepIndicator current={step} />
      </View>

      {/* Step content */}
      {step === 0 && <StepBasicInfo   draft={draft} update={update} clubs={clubs} />}
      {step === 1 && <StepFormat      draft={draft} update={update} />}
      {step === 2 && <StepRegistration draft={draft} update={update} />}
      {step === 3 && <StepRules       draft={draft} update={update} />}
      {step === 4 && (
        <StepPreview
          draft={draft}
          clubs={clubs}
          onSaveDraft={() => void handleSave('draft')}
          onPublish={() => void handleSave('published')}
          saving={saving}
        />
      )}

      {/* Bottom nav — hidden on preview step (it has its own buttons) */}
      {!isLastStep && (
        <View style={{
          paddingHorizontal: 20, paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          borderTopWidth: 1, borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          flexDirection: 'row', gap: 12,
        }}>
          <TouchableOpacity
            onPress={goBack}
            style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.lgs, color: theme.colors.text }}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNext}
            style={{ flex: 2, padding: 14, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.onPrimary }}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
