allprojects {
    repositories {
        google()
        mavenCentral()
        // SDK nativo do Mapbox (usado pelo `mapbox_maps_flutter`). O repositorio
        // e autenticado: exige um token SECRETO de download (`sk.*`) com escopo
        // DOWNLOADS:READ. Ele NAO mora no repositorio -- ponha em
        // `~/.gradle/gradle.properties` como MAPBOX_DOWNLOADS_TOKEN, ou exporte
        // a variavel de ambiente de mesmo nome na maquina de CI.
        maven {
            url = uri("https://api.mapbox.com/downloads/v2/releases/maven")
            authentication { create<BasicAuthentication>("basic") }
            credentials {
                username = "mapbox"
                password =
                    (project.findProperty("MAPBOX_DOWNLOADS_TOKEN") as String?)
                        ?: System.getenv("MAPBOX_DOWNLOADS_TOKEN")
                        ?: ""
            }
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
