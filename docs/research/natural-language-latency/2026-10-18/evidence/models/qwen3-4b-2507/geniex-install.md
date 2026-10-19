> ## Documentation Index
> Fetch the complete documentation index at: https://geniex.aihub.qualcomm.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Android Install

> Add the GenieX Android SDK to your Gradle project from Maven Central.

Add the GenieX SDK to an Android Studio project so your app can pull weights from Hugging Face / Qualcomm AI Hub and run them on the Hexagon NPU, Adreno GPU, or CPU compute units — all in Kotlin.

## **Try the sample app first**

See GenieX running on Android before you write any code. The reference chat app — with model picker, resumable downloads, and VLM support — lives in `qualcomm/ai-hub-apps`. Clone it, open it in Android Studio, and hit **Run ▶**.

<Card title="Get the GenieX Chat sample app" icon="github" href="https://github.com/qualcomm/ai-hub-apps/blob/release/geniex_chat_android/README.md">
  Build the reference chat app from source — follow the README to clone, build, and run it.
</Card>

Pick a model from the dropdown and choose NPU, GPU, or CPU on load. Tap the image button for VLMs. Stay on Wi-Fi for the first download.

No phone? See [Testing without a physical device](/en/resources/faq#how-do-i-test-the-android-demo-without-a-physical-device).

## **Prerequisites**

* **Android Studio** [Hedgehog (2023.1.1)](https://developer.android.com/studio/releases/past-releases/as-hedgehog-release-notes) or newer.
* **`minSdk = 27`** (Android 8.1) in your app module.
* A phone running **Snapdragon 8 Elite** (`SM8750`) or **Snapdragon 8 Elite Gen 5** (`SM8850`) — see [Supported platforms](/en/get-started/platforms).

## **Add the SDK to your app**

<Steps>
  <Step title="Enable Maven Central">
    In `settings.gradle.kts` (or your top-level `build.gradle.kts` for older projects):

    ```kotlin theme={"dark"}
    dependencyResolutionManagement {
        repositories {
            google()
            mavenCentral()
        }
    }
    ```
  </Step>

  <Step title="Add the dependency">
    In your **app module**'s `build.gradle.kts`:

    ```kotlin theme={"dark"}
    dependencies {
        implementation("com.qualcomm.qti:geniex-android:0.3.1")
    }
    ```

    The artifact ships native `arm64-v8a` libraries — no NDK or CMake on your side.
  </Step>

  <Step title="Declare permissions">
    The SDK pulls weights at runtime. In `AndroidManifest.xml`:

    ```xml theme={"dark"}
    <uses-permission android:name="android.permission.INTERNET" />
    ```

    For VLMs that load images from the gallery, also declare `READ_EXTERNAL_STORAGE` (or scoped media permissions on Android 13+).
  </Step>

  <Step title="Sync Gradle">
    Click **Sync Now** in Android Studio.
  </Step>
</Steps>

Next, head to the [Quickstart](/en/run/android/quickstart) to download and run your first model.

<br />

<div class="feedback-wrapper">
  <span class="feedback-label">Was this page helpful?</span>

  <div class="feedback-toggle">
    <input type="radio" name="feedback" id="feedback-yes" class="feedback-input" />

    <label for="feedback-yes" class="feedback-button">
      <img src="https://mintcdn.com/qualcomm-0801e48b/VijZ6eXFSGIGNc9Z/Images/FeedBack/thumbs-up.svg?fit=max&auto=format&n=VijZ6eXFSGIGNc9Z&q=85&s=9fa1e132909ee8667d02f775cd8bc108" alt="Thumbs up" class="feedback-icon" noZoom width="14" height="14" data-path="Images/FeedBack/thumbs-up.svg" />

      Yes
    </label>

    <input type="radio" name="feedback" id="feedback-no" class="feedback-input" />

    <label for="feedback-no" class="feedback-button">
      <img src="https://mintcdn.com/qualcomm-0801e48b/VijZ6eXFSGIGNc9Z/Images/FeedBack/thumbs-down.svg?fit=max&auto=format&n=VijZ6eXFSGIGNc9Z&q=85&s=7f5f8865b502b5262849a700e6989278" alt="Thumbs down" class="feedback-icon" noZoom width="14" height="14" data-path="Images/FeedBack/thumbs-down.svg" />

      No
    </label>
  </div>
</div>


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.