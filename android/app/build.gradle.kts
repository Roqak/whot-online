import java.util.Properties

plugins {
    id("com.android.application")
    id("com.github.triplet.play")
}

val keystoreProps = Properties().apply {
    val f = rootDir.parentFile?.resolve("upload-keystore.properties")
    if (f != null && f.exists()) f.inputStream().use { load(it) }
}

play {
    // Drop the GCP service-account JSON at the repo root as play-service-account.json
    // (gitignored). Upload: gradle publishReleaseBundle [-PplayTrack=internal|alpha|production]
    rootDir.parentFile?.resolve("play-service-account.json")?.takeIf { it.exists() }
        ?.let { serviceAccountCredentials.set(it) }
    track.set(providers.gradleProperty("playTrack").orElse("internal"))
}

android {
    namespace = "com.whot.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fun.lastcard.whot"
        minSdk = 21
        targetSdk = 35
        versionCode = 9
        versionName = "1.6.2"
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreProps.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The game ships inside the APK: dist-portal is copied to assets/ by the
    // build:android script before Gradle runs.
    sourceSets {
        getByName("main") {
            assets.srcDir("src/main/assets")
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.gms:play-services-games-v2:20.1.2")
    // appcompat and webkit pull different kotlin-stdlib generations; align on the full artifact.
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.8.22")
    constraints {
        implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.22") {
            because("kotlin-stdlib 1.8 merged the jdk7/jdk8 artifacts")
        }
        implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.22") {
            because("kotlin-stdlib 1.8 merged the jdk7/jdk8 artifacts")
        }
    }
}