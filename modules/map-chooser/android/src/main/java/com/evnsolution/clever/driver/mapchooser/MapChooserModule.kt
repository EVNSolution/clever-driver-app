package com.evnsolution.clever.driver.mapchooser

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MapChooserModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MapChooser")

    AsyncFunction("openMapChooser") { address: String ->
      val normalizedAddress = address.trim()
      if (normalizedAddress.isEmpty()) {
        throw MapChooserException("Destination address is required")
      }

      val mapIntent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("geo:0,0?q=${Uri.encode(normalizedAddress)}")
      )
      val chooser = Intent.createChooser(mapIntent, "지도 앱 선택")

      try {
        val activity = appContext.currentActivity
        if (activity === null) {
          chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          requireNotNull(appContext.reactContext).startActivity(chooser)
        } else {
          activity.startActivity(chooser)
        }
      } catch (error: ActivityNotFoundException) {
        throw MapChooserException("No compatible map app is installed", error)
      }
    }
  }
}

private class MapChooserException(
  message: String,
  cause: Throwable? = null
) : CodedException(message, cause)
