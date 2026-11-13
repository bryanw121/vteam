// Run against a web export built with EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co.
import { expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchChromium } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'
import { ME } from './fixtures/index.mjs'
const server = await serveDist(resolve(process.argv[2] || 'dist-mock'))
let browser
try {
 browser=await launchChromium()
 await mkdir('shots/border-preview',{recursive:true})
 for (const width of [390,1280]) {
 const context=await browser.newContext({viewport:{width,height:900}})
 const page=await context.newPage()
 const now=defaultNow()
 await context.clock.install({time:now})
 const {db}=await installSupabaseMock(page,{now,signedIn:true,seenIds:loadSeenIds(process.cwd()),relationships:loadRelationships(process.cwd())})
 const rows=db.rowsOf('user_badges'); rows.splice(0,rows.length)
 rows.push(...['event_attendee','event_host','communication_cheer','set_cheer'].map((badge_type,i)=>({id:`border-${i}`,user_id:ME,badge_type,tier:5,display_order:null,display_tier:null,awarded_at:now.toISOString()})))
 await page.goto(`${server.url}/settings/badges`)
 const group=page.getByRole('radiogroup',{name:'Profile border',exact:true})
 await expect(group).toBeVisible({timeout:30000}).catch(async e => { console.log(await page.locator('body').innerText()); throw e })
 for (const label of ['Bronze','Gold','Legend','Stormcaller','Aether','None']) {
 const option=group.getByRole('radio',{name:label,exact:true}); await option.click()
 await expect(option).toHaveAttribute('aria-checked','true')
 }
 await context.clock.runFor(300)
 await group.scrollIntoViewIfNeeded()
 await page.screenshot({path:`shots/border-preview/${width}.png`,fullPage:true})
 await page.goto(`${server.url}/profile`)
 await page.getByRole('button',{name:'Edit profile',exact:true}).click()
 await expect(page.getByRole('radiogroup',{name:'Profile border',exact:true})).toBeVisible()
 await context.close()
 console.log(`Border selection and editor preview passed at ${width}px`)
 }
} finally {await browser?.close();await server.close()}
