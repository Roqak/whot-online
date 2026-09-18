plugins {
    id("com.android.application")
}

android {
    namespace = "com.whot.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.whot.tv"
        minSdk = 21
        targetSdk = 35
        versionCode = 5
        versionName = "1.4"
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
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
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