plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.chatapp.chat_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.chatapp.chat_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // Release signing is configured entirely through environment variables
            // (CI secrets — never committed): ANDROID_KEYSTORE_PATH,
            // ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
            // When all four are present the APK is release-signed; otherwise it
            // falls back to the debug key, which is a documented beta limitation
            // (docs/development.md → Releases), unless ANDROID_REQUIRE_RELEASE_SIGNING
            // is set — e.g. by CI on demand — in which case the build fails loudly
            // instead of silently shipping a debug-signed "release".
            val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            val keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            val keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            val allSecretsPresent =
                !keystorePath.isNullOrBlank() &&
                    !keystorePassword.isNullOrBlank() &&
                    !keyAlias.isNullOrBlank() &&
                    !keyPassword.isNullOrBlank()

            if (allSecretsPresent) {
                signingConfigs {
                    create("release") {
                        storeFile = file(keystorePath)
                        storePassword = keystorePassword
                        keyAlias = keyAlias
                        keyPassword = keyPassword
                    }
                }
                signingConfig = signingConfigs.getByName("release")
            } else if (System.getenv("ANDROID_REQUIRE_RELEASE_SIGNING") == "true") {
                throw GradleException(
                    "ANDROID_REQUIRE_RELEASE_SIGNING=true but the release signing environment is incomplete. " +
                        "Set ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD " +
                        "(in CI these come from the ANDROID_KEYSTORE_* secrets). No key material is committed to the repository.",
                )
            } else {
                println(
                    "WARNING: building a DEBUG-SIGNED release APK. Fine for beta sideloading; " +
                        "not Play Store ready and not updatable in place. Configure the ANDROID_KEYSTORE_* secrets for real signing.",
                )
                signingConfig = signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
