# Not verified in this session (Docker build was not run). See docs/ai/FEATURE_MATRIX.md.
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 aegis
WORKDIR /app
COPY --from=build /src/target/aegissoc-api-*.jar app.jar
USER aegis
# Binds to all interfaces INSIDE the container only; docker-compose publishes it on 127.0.0.1.
ENV AEGIS_BIND_ADDRESS=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
