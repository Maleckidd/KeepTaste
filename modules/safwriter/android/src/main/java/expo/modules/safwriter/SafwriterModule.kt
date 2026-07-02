package expo.modules.safwriter

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.IOException

// Streams a local file into a SAF document URI (content://) via
// ContentResolver.openOutputStream, copying on a 1 MiB buffer. No base64 and no
// whole-file buffer on the heap, so backup size is bounded only by disk — this
// is what lifts the old ~60 MB SAF ceiling. Exists because expo-file-system SDK
// 52 has no stream/append for content://, and react-native-blob-util misroutes
// primary-storage SAF document URIs (its getRealPathFromURI fabricates a real
// path, so it never reaches openOutputStream). See docs/backup-freeze-rootcause.md.
class SafwriterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Safwriter")

    // AsyncFunction runs off the JS thread; the copy is plain blocking I/O.
    AsyncFunction("copyFileToSaf") { srcPath: String, destUri: String ->
      val context = appContext.reactContext
        ?: throw IOException("React context unavailable")
      val src = File(srcPath.removePrefix("file://"))
      val out = context.contentResolver.openOutputStream(Uri.parse(destUri), "w")
        ?: throw IOException("Could not open output stream for $destUri")
      out.use { output ->
        FileInputStream(src).use { input ->
          input.copyTo(output, DEFAULT_BUFFER_SIZE_BYTES)
          output.flush()
        }
      }
    }
  }

  companion object {
    private const val DEFAULT_BUFFER_SIZE_BYTES = 1024 * 1024
  }
}
