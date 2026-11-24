// eslint-disable-next-line @typescript-eslint/no-require-imports
const { describeUi, summaryLines } = require('../e2e/android/describe-screen.js') as {
  describeUi: (xml: string) => { packages: string[]; anr: string | null; texts: string[]; ids: string[]; empty: boolean }
  summaryLines: (d: ReturnType<typeof describeUi>, heading: string) => string[]
}

const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="" bounds="[0,0][1080,2400]">
<node index="0" text="System UI isn&apos;t responding" resource-id="android:id/alertTitle" class="android.widget.TextView" package="com.android.systemui" content-desc="" />
<node index="1" text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="com.android.systemui" />
<node index="2" text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="com.android.systemui" />
</node>
<node index="1" text="" resource-id="filter-all" class="android.view.ViewGroup" package="com.vteamvolleyball.app" content-desc="All" />
<node index="2" text="Games &amp; more" resource-id="" class="android.widget.TextView" package="com.vteamvolleyball.app" />
</hierarchy>`

describe('describe-screen (#361)', () => {
  it('names what is in front, the system dialog, texts and ids', () => {
    const d = describeUi(DUMP)
    expect(d.packages).toEqual(['com.android.systemui', 'com.vteamvolleyball.app'])
    expect(d.anr).toBe("System UI isn't responding")
    expect(d.texts).toEqual(["System UI isn't responding", 'Close app', 'Wait', 'All', 'Games & more'])
    expect(d.ids).toContain('filter-all')
    expect(d.empty).toBe(false)
  })

  it('says so when the dump is empty', () => {
    const d = describeUi('ERROR: could not get idle state.')
    expect(d.empty).toBe(true)
    expect(summaryLines(d, 'Warm-up').join('\n')).toContain('dump was empty')
  })

  it('writes a short Markdown block for the job summary', () => {
    const text = summaryLines(describeUi(DUMP), 'Guest browses the tabs').join('\n')
    expect(text).toContain('#### Guest browses the tabs')
    expect(text).toContain("**System dialog:** System UI isn't responding")
    expect(text).toContain('`filter-all`')
  })
})
