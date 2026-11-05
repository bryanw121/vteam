/**
 * Native: writes the PDF to the app's cache and opens the system print preview on it, where it
 * can be printed, saved to Files or shared (the same sheet the detailed scoresheet uses).
 * Both modules load on demand so an older build without them fails with a message, not a crash.
 */
export async function deliverPdf(bytes: Uint8Array, fileName: string): Promise<void> {
  const { File, Paths } = await import('expo-file-system')
  const Print = await import('expo-print')
  const file = new File(Paths.cache, fileName)
  if (file.exists) file.delete()
  file.create()
  file.write(bytes)
  await Print.printAsync({ uri: file.uri, orientation: Print.Orientation.landscape })
}
