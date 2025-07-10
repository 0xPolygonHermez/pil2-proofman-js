WITNESS_DIR ?= ./tmp
WITNESS_FILE ?= libwitness.so
FINAL_VADCOP ?= false

BUILD_DIR := ./build

ifeq ($(FINAL_VADCOP), true)
    OPT_LEVEL := -O1
else
    OPT_LEVEL := -O3
endif

CXX := g++
CXXFLAGS := -std=c++17 -Wall -pthread -flarge-source-files -Wno-unused-label -rdynamic -mavx2 $(OPT_LEVEL) #-Wfatal-errors
CXXFLAGS_EXT := -fPIC
CFLAGS := -fopenmp -Wno-unused-variable

CPPFLAGS := -I ./src/setup/circom -MMD -MP

witness: $(WITNESS_DIR)/$(WITNESS_FILE)

clean:
	$(RM) -r $(BUILD_DIR)

SRCS_WITNESS_LIB := calcwit.cpp main.cpp verifier.cpp poseidon2_goldilocks.cpp goldilocks_base_field.cpp cmul.cpp
OBJS_WITNESS_LIB := $(SRCS_WITNESS_LIB:%=$(BUILD_DIR)/%.o)
DEPS_WITNESS_LIB := $(OBJS_WITNESS_LIB:.o=.d)

$(WITNESS_DIR)/$(WITNESS_FILE): $(OBJS_WITNESS_LIB)
	$(MKDIR_P) $(WITNESS_DIR)
	$(CXX) -shared -o $@ $^ -lgmp -lgmpxx


# C++ source compilation rule
$(BUILD_DIR)/%.cpp.o: %.cpp
	$(MKDIR_P) $(dir $@)
	$(CXX) $(CFLAGS) $(CPPFLAGS) $(CXXFLAGS) $(CXXFLAGS_EXT) -c $< -o $@

MKDIR_P ?= mkdir -p

.PHONY: clean