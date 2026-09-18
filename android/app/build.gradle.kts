plugins {
    id("com.android.application")
}

android {
    namespace = "com.whot.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fun.lastcard.whot"
        minSdk = 21
        targetSdk = 35
        versionCode = 8
        versionName = "1.6.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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