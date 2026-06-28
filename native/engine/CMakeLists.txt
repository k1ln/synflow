cmake_minimum_required(VERSION 3.20)
project(synflow_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Framework-light engine core. juce::dsp builtin nodes and the wasmtime WasmNode
# link in later against the same INode interface; the plugin shell (JUCE) and the
# standalone app build on top of this library.
add_library(synflow_engine
    src/AudioGraphManager.cpp
    src/FlowLoader.cpp)
target_include_directories(synflow_engine PUBLIC include)

add_executable(engine_demo src/main_demo.cpp)
target_link_libraries(engine_demo PRIVATE synflow_engine)

add_executable(flow_demo src/flow_demo.cpp)
target_link_libraries(flow_demo PRIVATE synflow_engine)

add_executable(builtin_test src/builtin_test.cpp)
target_link_libraries(builtin_test PRIVATE synflow_engine)
