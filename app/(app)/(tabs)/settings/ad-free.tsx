import React, { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { RefreshControl } from '../../../../components/RefreshControl'
import { Button } from '../../../../components/Button'
import { ConfirmDialog, ScreenContainer, ScreenState } from '../../../../components/ui'
import { Toast } from '../../../../components/Toast'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useAdFreeStatus, useRedeemAdFree } from '../../../../hooks/useAdFree'
import { GENERIC_ERROR_MESSAGE, shared, theme } from '../../../../constants'
import { adFreeView, formatAdFreeDate } from '../../../../utils/adFree'
import type { ToastState } from '../../../../types'

/**
 * Spend points to hide ads (banners and sponsored slots) for a while. The
 * price comes from the server (`ad_free_offer()`); buying again while a period
 * is running extends it from its current end.
 */
export default function AdFreeScreen() {
  useStackBackTitle('Go ad-free')
  const status = useAdFreeStatus()
  const redeem = useRedeemAdFree()
  const [confirming, setConfirming] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await status.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  async function handleConfirm() {
    const result = await redeem.mutate()
    setConfirming(false)
    if (!result) {
      setToast({ message: GENERIC_ERROR_MESSAGE, variant: 'error' })
      return
    }
    if (!result.ok) {
      setToast({ message: `You need ${result.cost - result.balance} more points.`, variant: 'info' })
      return
    }
    if (result.ad_free_until) {
      setToast({ message: `No ads until ${formatAdFreeDate(new Date(result.ad_free_until))}.`, variant: 'success' })
    }
  }

  const data = status.data
  const view = data ? adFreeView(data) : null

  return (
    <View style={shared.screen}>
      <ScreenState
        loading={status.isLoading}
        error={status.error && !data ? 'Could not load your points.' : null}
        ready={!!data}
        onRetry={() => void status.refetch({ force: true })}
      >
        {data && view ? (
          <ScrollView
            contentContainerStyle={shared.scrollContentSubpage}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={theme.colors.primary} />}
          >
            <ScreenContainer>
              <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.lg }]}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Your points
                </Text>
                <Text testID="ad-free-balance" style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.xxl, color: theme.colors.text, letterSpacing: -1 }}>
                  {data.balance}
                </Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                  Earn 2 for each open play and 5 for each tournament you attend.
                </Text>
              </View>

              <View style={[shared.card, { gap: theme.spacing.sm, marginTop: theme.spacing.md }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Ionicons name={view.active ? 'checkmark-circle' : 'sparkles-outline'} size={20} color={view.active ? theme.colors.success : theme.colors.primary} />
                  <Text style={{ flex: 1, fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg, color: theme.colors.text }}>
                    {view.active ? 'You are ad-free' : 'Hide ads'}
                  </Text>
                </View>
                <Text testID="ad-free-state" style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.subtext, lineHeight: 20 }}>
                  {view.active && view.untilDate
                    ? `No banners or sponsored events until ${formatAdFreeDate(view.untilDate)}. Adding more time extends it from that date.`
                    : `Spend ${data.cost} points to hide banners and sponsored events for ${data.days} days.`}
                </Text>

                <View style={{ marginTop: theme.spacing.sm }}>
                  <Button
                    testID="ad-free-redeem"
                    label={view.active ? `Add ${data.days} days — ${data.cost} points` : `Go ad-free for ${data.days} days — ${data.cost} points`}
                    onPress={() => setConfirming(true)}
                    disabled={!view.canRedeem}
                    loading={redeem.isPending}
                    size="touch"
                  />
                </View>
                {!view.canRedeem && (
                  <Text testID="ad-free-short" style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                    {`You need ${view.shortBy} more ${view.shortBy === 1 ? 'point' : 'points'}.`}
                  </Text>
                )}
              </View>
            </ScreenContainer>
          </ScrollView>
        ) : null}
      </ScreenState>

      <ConfirmDialog
        visible={confirming}
        title={`Spend ${data?.cost ?? 0} points?`}
        body={view ? `No ads until ${formatAdFreeDate(view.nextUntilDate)}.` : undefined}
        confirmLabel="Spend points"
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirming(false)}
        loading={redeem.isPending}
      />

      <Toast message={toast?.message ?? ''} variant={toast?.variant} visible={!!toast} onHide={() => setToast(null)} />
    </View>
  )
}
